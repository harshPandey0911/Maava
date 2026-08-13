import HomeServiceBooking from '../models/HomeServiceBooking.js';
import BookingRequest from '../models/HomeServiceBookingRequest.js';
import Worker from '../models/Worker.js';
import Settings from '../models/Settings.js';
import { BOOKING_STATUS } from '../utils/constants.js';
import { createNotification } from '../controllers/notificationControllers/notificationController.js';
import { findNearbyWorkers } from '../services/locationService.js';

// The Wave Timeout in milliseconds (60 seconds) — controls ONLY how long the
// scheduler waits before advancing to the next wave. Do NOT reuse this for
// BookingRequest.expiresAt: that field carries a Mongo TTL index
// (expireAfterSeconds: 0), so setting it to this same 60s value causes every
// BookingRequest to self-delete almost immediately after creation — wiping
// out the "who's already been notified" / "did everyone reject" tracking
// this whole wave system depends on. Use BOOKING_REQUEST_TTL_MS for that.
const WAVE_TIMEOUT_MS = 60000;
const WORKERS_PER_WAVE = 3;

// How long a BookingRequest record survives before Mongo's TTL index deletes
// it. Matches the 1-hour expiry createBooking() already uses for Wave 1, so
// waves 2+ (created here) don't disappear far sooner than Wave 1 does.
const BOOKING_REQUEST_TTL_MS = 60 * 60 * 1000;

// How long to keep retrying the nearby-worker search when NONE were found at
// booking-creation time, before finally declaring "no workers available".
const INITIAL_SEARCH_WINDOW_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Handles bookings that had ZERO nearby partners at creation time (currentWave === 0).
 * Re-runs the geo search on every scheduler tick (10s) for up to 3 minutes.
 * If partners show up in that window, kicks off Wave 1 normally.
 * If the 3-minute window elapses with still nothing found, marks the booking failed.
 */
const handleInitialSearchRetry = async (booking, io) => {
  try {
    const timeElapsed = Date.now() - new Date(booking.waveStartedAt).getTime();
    const bookingModel = 'worker';

    const bookingLocation = { lat: booking.address?.lat, lng: booking.address?.lng };
    let partners = [];

    if (bookingLocation.lat && bookingLocation.lng) {
      const globalSettings = await Settings.findOne({ type: 'global' }).select('searchRadius').lean();
      const searchRadius = globalSettings?.searchRadius || 10;
      const filters = { service: booking.serviceCategory };

      partners = await findNearbyWorkers(bookingLocation, searchRadius, filters);

      // Dedupe by id
      const seen = new Set();
      partners = partners.filter(p => {
        const idStr = p._id.toString();
        if (seen.has(idStr)) return false;
        seen.add(idStr);
        return true;
      });
    }

    if (partners.length > 0) {
      // Found some! Kick off Wave 1 exactly like a normal successful search.
      const sortedPartners = partners.sort((a, b) => (a.distance || 0) - (b.distance || 0));
      const wave1Partners = sortedPartners.slice(0, WORKERS_PER_WAVE);

      booking.potentialWorkers = sortedPartners.map(v => ({ workerId: v._id, distance: v.distance || 0 }));
      booking.currentWave = 1;
      booking.waveStartedAt = new Date();
      booking.notifiedPartners = wave1Partners.map(v => v._id);
      await booking.save();

      const newRequests = wave1Partners.map(pw => ({
        bookingId: booking._id,
        workerId: pw._id,
        status: 'PENDING',
        wave: 1,
        distance: pw.distance || null,
        sentAt: new Date(),
        expiresAt: new Date(Date.now() + BOOKING_REQUEST_TTL_MS)
      }));

      try {
        await BookingRequest.insertMany(newRequests, { ordered: false });
      } catch (err) {
        if (err.code !== 11000) console.error('[WaveScheduler] BookingRequest insert error:', err);
      }

      wave1Partners.forEach(pw => {
        const room = `worker_${pw._id.toString()}`;
        io.to(room).emit('new_job_assigned', {
          bookingId: booking._id,
          serviceName: booking.serviceName,
          address: booking.address,
          price: booking.finalAmount,
          serviceCategory: booking.serviceCategory,
          brandName: booking.brandName,
          brandIcon: booking.brandIcon,
          categoryIcon: booking.categoryIcon,
          scheduledDate: booking.scheduledDate,
          scheduledTime: booking.scheduledTime,
          createdAt: new Date().toISOString()
        });

        createNotification({
          workerId: pw._id,
          type: 'new_job_assigned',
          title: 'New Job Alert',
          message: `New booking for ${booking.serviceName} is available near you.`,
          relatedId: booking._id,
          relatedType: 'booking',
          priority: 'high',
          pushData: { type: 'new_job', bookingId: booking._id.toString(), link: `/worker/job/${booking._id}` }
        });
      });

      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.SEARCHING,
        message: 'Found nearby professionals! Sending your request now...'
      });

      console.log(`[WaveScheduler] Booking ${booking.bookingNumber}: Found ${wave1Partners.length} ${bookingModel}(s) during retry search (after ${Math.round(timeElapsed / 1000)}s).`);
      return;
    }

    // Still nothing found this tick.
    if (timeElapsed >= INITIAL_SEARCH_WINDOW_MS) {
      // 3 minutes of retrying with zero partners found — give up.
      booking.status = BOOKING_STATUS.NO_WORKERS;
      booking.waveStartedAt = null;
      await booking.save();

      console.log(`[WaveScheduler] Booking ${booking.bookingNumber}: No ${bookingModel}s found after 3 minutes of searching. Giving up.`);

      io.to(`user_${booking.userId}`).emit('booking_search_failed', {
        bookingId: booking._id,
        message: `No ${bookingModel}s available nearby right now.`
      });
      io.to(`user_${booking.userId}`).emit('booking_updated', {
        bookingId: booking._id,
        status: BOOKING_STATUS.NO_WORKERS,
        message: 'No professionals available nearby at the moment.'
      });

      await createNotification({
        userId: booking.userId,
        type: 'booking_failed',
        title: 'No Professionals Available',
        message: `We couldn't find any ${bookingModel}s nearby after searching for 3 minutes. Our team will contact you shortly.`,
        relatedId: booking._id,
        relatedType: 'booking',
        priority: 'high',
        pushData: { type: 'booking_failed', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
      });
    }
    // else: still within the 3-minute window — do nothing, next tick (10s) will retry again.
  } catch (err) {
    console.error(`[WaveScheduler] Initial search retry failed for booking ${booking.bookingNumber}:`, err);
  }
};

export const startWaveScheduler = (io) => {
  if (!io) {
    console.error('[WaveScheduler] Cannot start: Socket.io instance not provided.');
    return;
  }

  console.log('[WaveScheduler] Starting Wave Scheduler (runs every 10s)...');

  setInterval(async () => {
    try {
      // Find bookings that are currently in SEARCHING status and have an active wave
      const activeBookings = await HomeServiceBooking.find({
        status: BOOKING_STATUS.SEARCHING,
        waveStartedAt: { $ne: null }
      });

      for (const booking of activeBookings) {
        // currentWave === 0 means the initial search found zero partners — keep
        // retrying the geo search (instead of advancing/expiring a wave) until
        // either partners show up or the 3-minute window elapses.
        if (booking.currentWave === 0) {
          await handleInitialSearchRetry(booking, io);
          continue;
        }

        const timeElapsed = Date.now() - new Date(booking.waveStartedAt).getTime();
        let shouldAdvanceWave = false;

        // Condition 1: Wave Timeout Reached (60 seconds)
        if (timeElapsed >= WAVE_TIMEOUT_MS) {
          shouldAdvanceWave = true;
        } else {
          // Condition 2: Check if all notified workers for the CURRENT wave have REJECTED
          const currentWaveRequests = await BookingRequest.find({
            bookingId: booking._id,
            wave: booking.currentWave
          });

          if (currentWaveRequests.length > 0) {
            const allRejected = currentWaveRequests.every(req => req.status === 'REJECTED' || req.status === 'EXPIRED');
            if (allRejected) {
              shouldAdvanceWave = true;
              console.log(`[WaveScheduler] Booking ${booking.bookingNumber}: All workers in Wave ${booking.currentWave} rejected early.`);
            }
          }
        }

        if (shouldAdvanceWave) {
          // Expire pending requests from the old wave
          await BookingRequest.updateMany(
            { bookingId: booking._id, wave: booking.currentWave, status: 'PENDING' },
            { $set: { status: 'EXPIRED' } }
          );

          // Find the next batch of workers
          const potentialWorkers = booking.potentialWorkers || [];
          
          // Robust check: Get all workers who have already been notified for this booking across ALL waves
          const pastRequests = await BookingRequest.find({ bookingId: booking._id });
          const notifiedWorkerIds = pastRequests.map(req => String(req.workerId));

          // Filter workers who haven't been notified yet
          const unnotifiedWorkers = potentialWorkers.filter(
            pw => !notifiedWorkerIds.includes(String(pw.workerId))
          );

          if (unnotifiedWorkers.length === 0) {
            // No more workers left to notify
            console.log(`[WaveScheduler] Booking ${booking.bookingNumber}: No more workers available.`);
            booking.status = BOOKING_STATUS.NO_WORKERS;
            booking.waveStartedAt = null;
            await booking.save();

            // Notify User
            io.to(`user_${booking.userId}`).emit('booking_updated', {
              bookingId: booking._id,
              status: BOOKING_STATUS.NO_WORKERS,
              message: 'Our team will shortly contact you directly and assign an Expert.'
            });

            await createNotification({
              userId: booking.userId,
              type: 'booking_failed',
              title: 'No Professionals Available',
              message: 'We couldn\'t find any professionals nearby at the moment. Our team will contact you shortly.',
              relatedId: booking._id,
              relatedType: 'booking',
              priority: 'high',
              pushData: { type: 'booking_failed', bookingId: booking._id.toString(), link: `/user/booking/${booking._id}` }
            });

            continue;
          }

          // We have more workers to notify! Take the next batch.
          const nextBatch = unnotifiedWorkers.slice(0, WORKERS_PER_WAVE);
          const nextWaveNumber = (booking.currentWave || 1) + 1;

          console.log(`[WaveScheduler] Booking ${booking.bookingNumber}: Advancing to Wave ${nextWaveNumber} with ${nextBatch.length} workers.`);

          booking.currentWave = nextWaveNumber;
          booking.waveStartedAt = new Date();
          
          await booking.save();

          // Create Booking Requests
          const newRequests = nextBatch.map(pw => ({
            bookingId: booking._id,
            workerId: pw.workerId,
            status: 'PENDING',
            wave: nextWaveNumber,
            distance: pw.distance,
            sentAt: new Date(),
            expiresAt: new Date(Date.now() + BOOKING_REQUEST_TTL_MS)
          }));

          await BookingRequest.insertMany(newRequests, { ordered: false });

          // Fetch full booking details to send to worker
          const fullBooking = await HomeServiceBooking.findById(booking._id)
            .populate('userId', 'name phone')
            .lean();

          // Emit to new workers
          nextBatch.forEach(pw => {
            const workerRoom = `worker_${pw.workerId}`;
            io.to(workerRoom).emit('new_job_assigned', {
              bookingId: booking._id,
              serviceName: fullBooking.serviceName,
              customerName: fullBooking.userId?.name || 'Customer',
              customerPhone: fullBooking.userId?.phone,
              address: fullBooking.address,
              price: fullBooking.finalAmount,
              serviceCategory: fullBooking.serviceCategory,
              brandName: fullBooking.brandName,
              brandIcon: fullBooking.brandIcon,
              categoryIcon: fullBooking.categoryIcon,
              scheduledDate: fullBooking.scheduledDate,
              scheduledTime: fullBooking.scheduledTime,
              createdAt: new Date().toISOString()
            });

            createNotification({
              workerId: pw.workerId,
              type: 'new_job_assigned',
              title: 'New Job Alert',
              message: `New booking for ${fullBooking.serviceName} is available near you.`,
              relatedId: booking._id,
              relatedType: 'booking',
              priority: 'high',
              pushData: { type: 'new_job', bookingId: booking._id.toString(), link: `/worker/job/${booking._id}` }
            });
          });

          // Notify User about the ongoing search progress
          io.to(`user_${booking.userId}`).emit('booking_updated', {
            bookingId: booking._id,
            status: BOOKING_STATUS.SEARCHING,
            message: `Expanding search to more professionals (Wave ${nextWaveNumber})... Please hold on.`
          });
        }
      }
    } catch (error) {
      console.error('[WaveScheduler] Error running scheduler cycle:', error);
    }
  }, 10000); // Run every 10 seconds
};
