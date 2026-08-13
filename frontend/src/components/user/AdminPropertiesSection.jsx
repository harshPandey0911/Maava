import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { usePropertyNavigate } from '../../hooks/usePropertyNavigate';
import {
    MapPin, Building2, Star, Navigation,
    IndianRupee, ArrowRight, Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { propertyService } from '../../services/propertyService';
import toast from 'react-hot-toast';

const PROPERTY_TYPE_ICONS = {
    hotel: '🏨', villa: '🏡', pg: '🏠', hostel: '🛏️',
    resort: '🌴', homestay: '🏘️', rent: '🔑', buy: '🏢', plot: '🌿'
};

/* ─── Property Card ─── */
const AdminPropertyCard = ({ property, index, theme }) => {
    const navigate = useNavigate();
    const [isSaved, setIsSaved] = useState(false);
    const typeIcon = PROPERTY_TYPE_ICONS[property.propertyType] || '🏠';
    
    // Resolve price from towers / pricePerSqft / startingPrice / buyDetails
    const getTowerMinPrice = () => {
        if (Array.isArray(property.dynamicData?.towers)) {
             for (const t of property.dynamicData.towers) {
                  if (t.minPrice) return t.minPrice;
             }
        }
        if (property.dynamicData?.bpd_currentPricePerSqft && property.dynamicData?.carpetArea) {
             const sqft = Number(property.dynamicData.carpetArea);
             const pSqft = Number(property.dynamicData.bpd_currentPricePerSqft);
             if (sqft > 0 && pSqft > 0) return sqft * pSqft;
        }
        return null;
    };

    const rawPrice = property.startingPrice
        || getTowerMinPrice()
        || property.rentDetails?.monthlyRent
        || property.pgDetails?.monthlyRent
        || property.buyDetails?.expectedPrice
        || property.plotDetails?.expectedPrice
        || property.dynamicData?.expectedPrice
        || property.dynamicData?.monthlyRent
        || property.dynamicData?.expectedRent
        || property.dynamicData?.price
        || property.minPrice
        || property.price
        || null;

    const formatPriceValue = (val) => {
        if (!val) return 'Contact for Price';
        const num = Number(val.toString().replace(/,/g, ''));
        if (isNaN(num) || num <= 0) return val; // fallback for string ranges like "2.91 - 4.42 Cr"
        if (num >= 10000000) {
            return `₹ ${(num / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
        }
        if (num >= 100000) {
            return `₹ ${(num / 100000).toFixed(2).replace(/\.00$/, '')} Lac`;
        }
        return `₹ ${num.toLocaleString('en-IN')}`;
    };

    const priceText = property.dynamicPriceText || formatPriceValue(rawPrice);

    // Resolve BHK and location details
    const getBhkText = () => {
        const bhk = property.bhk || property.dynamicData?.bedrooms || property.dynamicData?.bhk;
        if (bhk) return `${bhk} BHK`;
        
        const type = property.rentDetails?.type || property.buyDetails?.type;
        if (type) return type.includes('BHK') ? type : `${type} BHK`;

        const pt = property.propertyType || property.dynamicCategory?.displayName || property.dynamicCategory?.name;
        if (pt) {
            return pt.charAt(0).toUpperCase() + pt.slice(1);
        }
        return 'Property';
    };

    const bhkText = getBhkText();
    const loc = property.address?.area || property.address?.locality || property.dynamicData?.locality || property.address?.city || property.dynamicData?.city || '';
    const detailsText = loc ? (bhkText ? `${bhkText}, ${loc}` : loc) : bhkText;
    
    // Fallback Property Name
    const displayName = property.propertyName || property.dynamicData?.propertyName || 'Untitled Property';

    // Brand logo fallback to first image (coverImage)
    const displayLogo = property.logo || property.coverImage || '/src/assets/grh-logo.png';
    const logoIsCover = !property.logo && property.coverImage;

    const { navigateToProperty } = usePropertyNavigate();

    const handleToggleSave = (e) => {
        e.stopPropagation();
        setIsSaved(!isSaved);
        toast.success(isSaved ? "Removed from saved properties" : "Property saved successfully!");
    };

    const handleCardClick = () => {
        if (property.isDummy) {
            toast.success("This is a demo property card showcasing the layout!");
            return;
        }

        // Force navigate to project since these are featured builder projects
        navigate(`/project/${property._id || property.id}`);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.35, ease: 'easeOut' }}
            className="min-w-[280px] md:min-w-[320px] max-w-[320px] snap-center shrink-0"
        >
            <div onClick={handleCardClick} className="block group cursor-pointer relative">
                <div className="relative rounded-3xl overflow-hidden bg-white border border-gray-100 shadow-md hover:shadow-xl hover:shadow-gray-200/50 transition-all duration-300 hover:-translate-y-1 h-[340px] w-full flex flex-col">
                    {/* Full Card Background Image */}
                    <div className="absolute inset-0 w-full h-full overflow-hidden bg-gray-50">
                        {(() => {
                            const dynImages = property.dynamicData?.photos || property.dynamicData?.images || property.dynamicData?.propertyImages || [];
                            const extractedImage = property.coverImage || property.images?.[0] || property.propertyImages?.[0] || dynImages[0] || null;
                            if (extractedImage) {
                                return (
                                    <img
                                        src={extractedImage}
                                        alt={property.propertyName}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = '/src/assets/grh-logo.png';
                                        }}
                                    />
                                );
                            } else {
                                return (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <Building2 size={36} className="text-gray-200" />
                                    </div>
                                );
                            }
                        })()}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent pointer-events-none" />
                    </div>

                    {/* Featured Badge (Top Left) */}
                    {property.featuredDetails?.isFeatured && (
                        <div className="absolute top-4 left-4 z-10">
                            <span className="bg-amber-500/95 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-md">
                                Featured
                            </span>
                        </div>
                    )}

                    {/* Heart Button (Top Right) */}
                    <div className="absolute top-4 right-4 z-10">
                        <button
                            onClick={handleToggleSave}
                            className="w-8 h-8 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center text-gray-600 hover:text-red-500 transition-colors shadow-sm active:scale-95"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                fill={isSaved ? "currentColor" : "none"}
                                viewBox="0 0 24 24"
                                strokeWidth={2}
                                stroke="currentColor"
                                className={`w-4 h-4 ${isSaved ? 'text-red-500' : 'text-gray-600'}`}
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                            </svg>
                        </button>
                    </div>

                    {/* White Floating Content Box */}
                    <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md rounded-2xl p-4 pt-7 shadow-lg flex flex-col items-center border border-gray-100/50">
                        {/* Circular Brand Logo Badge */}
                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-white border-2 border-gray-100 shadow-md flex items-center justify-center p-1.5 overflow-hidden z-20">
                            <img
                                src={displayLogo}
                                alt="Brand Logo"
                                className={`w-full h-full rounded-full ${logoIsCover ? 'object-cover' : 'object-contain'}`}
                                onError={(e) => {
                                    e.target.onerror = null;
                                    e.target.src = '/src/assets/grh-logo.png';
                                }}
                            />
                        </div>

                        {/* Title */}
                        <h3 className={`font-black text-sm text-gray-900 text-center line-clamp-1 mb-1 transition-colors duration-300 ${theme?.groupHoverText || 'group-hover:text-emerald-700'}`}>
                            {displayName}
                        </h3>

                        {/* BHK & Area Details */}
                        <span className="text-[10px] text-gray-400 text-center truncate mb-2 max-w-full">
                            {detailsText}
                        </span>

                        {/* Price */}
                        <span className="font-black text-gray-900 text-sm text-center">
                            {priceText}{property.propertyType === 'rent' ? '/mo' : ''}
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

/* ─── Skeleton Loader ─── */
const SkeletonCard = () => (
    <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white animate-pulse">
        <div className="h-44 bg-gray-100" />
        <div className="p-4 space-y-3">
            <div className="h-4 bg-gray-100 rounded-full w-3/4" />
            <div className="h-3 bg-gray-100 rounded-full w-1/2" />
            <div className="h-4 bg-gray-100 rounded-full w-1/3" />
        </div>
    </div>
);

// Simple client-side cache to instantly render previously loaded lists on back navigation
const adminPropertiesCache = {
    cities: null,
    propertiesByCity: {},
    selectedCity: null
};

/* ─── Main Component ─── */
const AdminPropertiesSection = ({ searchCity, transactionType, title, subtitle, themeColor = 'emerald', theme }) => {
    const navigate = useNavigate();

    const [availableCities, setAvailableCities] = useState(() => adminPropertiesCache.cities || []);

    // Re-mounting (e.g. navigating back from a property page) must resume
    // whichever city was actually loaded last — not just "the first city in
    // the list", which was often a different city than the one whose
    // properties were cached, making the cache check below miss, the
    // section reset to a loading state, and nothing ever fetch again to
    // clear it (a permanent skeleton on back navigation).
    const initialCity = adminPropertiesCache.selectedCity
        || (adminPropertiesCache.cities?.length > 0 ? adminPropertiesCache.cities[0].city : null);
    const [selectedCity, setSelectedCity] = useState(initialCity);
    
    const [properties, setProperties] = useState(() => {
        return (initialCity && adminPropertiesCache.propertiesByCity[initialCity]) 
            ? adminPropertiesCache.propertiesByCity[initialCity] 
            : [];
    });
    
    const [loading, setLoading] = useState(() => {
        return !(initialCity && adminPropertiesCache.propertiesByCity[initialCity]);
    });
    
    const [citiesLoading, setCitiesLoading] = useState(() => !adminPropertiesCache.cities);
    const [detectingLocation, setDetectingLocation] = useState(false);
    const [localQuery, setLocalQuery] = useState("");
    const scrollRef = useRef(null); // For cities list
    const propertiesScrollRef = useRef(null); // For properties list

    // Horizontal Scroll Memory for properties carousel
    React.useLayoutEffect(() => {
        if (!loading && propertiesScrollRef.current) {
            const savedScroll = sessionStorage.getItem(`scroll-left-admin-properties`);
            if (savedScroll) {
                propertiesScrollRef.current.scrollLeft = parseInt(savedScroll, 10);
            }
        }
    }, [loading, selectedCity]);

    const handlePropertiesScroll = () => {
        if (propertiesScrollRef.current) {
            sessionStorage.setItem(`scroll-left-admin-properties`, propertiesScrollRef.current.scrollLeft.toString());
        }
    };

    // Sync with external searchCity prop (from HeroSection).
    // Search for whatever the user actually picked — a property can be in
    // ANY location, so there's nothing to "match" against a known-cities
    // list here. Falling back to a different city when the search term
    // isn't already in availableCities (e.g. it has no featured listings
    // yet) would silently ignore the user's search, which is exactly the
    // bug this used to have.
    useEffect(() => {
        if (searchCity) {
            setLocalQuery("");
            selectCity(searchCity);
        } else {
            setLocalQuery("");
        }
    }, [searchCity]);

    // Step 1: Fetch all available cities on mount.
    // Also kick off the Bengaluru properties fetch immediately in parallel —
    // it doesn't depend on the cities list at all, and Bengaluru is the
    // known default market — instead of waiting for cities to resolve first
    // and only then starting the properties request. That sequential chain
    // was doubling the section's load time for no reason.
    useEffect(() => {
        if (!adminPropertiesCache.cities) {
            selectCity('Bengaluru');
        }

        const fetchCities = async () => {
            if (adminPropertiesCache.cities) {
                return; // Already initialized from cache synchronously
            }

            setCitiesLoading(true);
            try {
                const res = await propertyService.getAdminPropertyCities();
                let cities = res?.cities || [];

                // Inject dummy city if empty so the Handpicked section is visible for demo
                if (cities.length === 0) {
                    cities = [{ city: 'Bengaluru', count: 1 }];
                }

                adminPropertiesCache.cities = cities;
                setAvailableCities(cities);

                if (cities.length > 0) {
                    const bengCity = cities.find(c => c.city.toLowerCase() === 'bengaluru');
                    const targetCity = bengCity ? bengCity.city : cities[0].city;
                    // Only fetch again if the optimistic Bengaluru guess above was wrong
                    if (targetCity !== 'Bengaluru') {
                        selectCity(targetCity);
                    }
                }
            } catch (err) {
                console.error('Cities fetch failed:', err);
            } finally {
                setCitiesLoading(false);
            }
        };
        fetchCities();
    }, []);

    // Step 2: Try to auto-detect user location and match with available cities
    const autoDetectCity = async (cities) => {
        if (!navigator.geolocation) return;
        try {
            const position = await new Promise((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
            );
            const { latitude, longitude } = position.coords;

            const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            );
            const geoData = await geoRes.json();
            const detectedCity = geoData.address?.city
                || geoData.address?.town
                || geoData.address?.village
                || '';

            // Try to match detected city with available cities (case-insensitive)
            const matched = cities.find(c =>
                c.city.toLowerCase() === detectedCity.toLowerCase()
            );

            if (matched) {
                selectCity(matched.city);
                if (matched.city !== 'Bengaluru') {
                    toast(`Currently, Get-Right-Home services are only live in Bengaluru. Launching in ${matched.city} soon! 🚀`, {
                        duration: 5000,
                        icon: 'ℹ️'
                    });
                }
            } else if (cities.length > 0) {
                // Fallback to first available city
                selectCity(cities[0].city);
            }
        } catch {
            // Geolocation failed — just select first city
            if (cities.length > 0) {
                selectCity(cities[0].city);
            }
        }
    };

    // Step 3: Fetch properties for selected city
    const selectCity = async (city) => {
        setSelectedCity(city);
        adminPropertiesCache.selectedCity = city;

        if (adminPropertiesCache.propertiesByCity[city]) {
            setProperties(adminPropertiesCache.propertiesByCity[city]);
            setLoading(false);
            return;
        }
        
        setLoading(true);
        try {
            const res = await propertyService.getAdminPropertiesByLocation({ city });
            const props = res?.properties || [];
            adminPropertiesCache.propertiesByCity[city] = props;
            setProperties(props);
        } catch {
            setProperties([]);
        } finally {
            setLoading(false);
        }
    };

    // Manual location detect button
    const handleDetectLocation = async () => {
        if (!navigator.geolocation) return;
        setDetectingLocation(true);
        try {
            const position = await new Promise((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000 })
            );
            const { latitude, longitude } = position.coords;
            const geoRes = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            );
            const geoData = await geoRes.json();
            const detectedCity = geoData.address?.city
                || geoData.address?.town
                || geoData.address?.village
                || '';

            const matched = availableCities.find(c =>
                c.city.toLowerCase() === detectedCity.toLowerCase()
            );

            if (matched) {
                selectCity(matched.city);
                if (matched.city !== 'Bengaluru') {
                    toast(`Currently, Get-Right-Home services are only live in Bengaluru. Launching in ${matched.city} soon! 🚀`, {
                        duration: 5000,
                        icon: 'ℹ️'
                    });
                }
            } else {
                // City not in admin list — fetch anyway
                setSelectedCity(detectedCity);
                toast(`Currently, Get-Right-Home services are only live in Bengaluru. Launching in ${detectedCity} soon! 🚀`, {
                    duration: 5000,
                    icon: 'ℹ️'
                });
                setLoading(true);
                try {
                    const res = await propertyService.getAdminPropertiesByLocation({ city: detectedCity });
                    setProperties(res?.properties || []);
                } catch {
                    setProperties([]);
                } finally {
                    setLoading(false);
                }
            }
        } catch {
            // silently fail
        } finally {
            setDetectingLocation(false);
        }
    };

    // Scroll city chips
    const scrollCities = (dir) => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ left: dir * 200, behavior: 'smooth' });
        }
    };

    const filteredProperties = properties.filter(property => {
        // Filter by transaction type if prop is provided
        if (transactionType) {
            const typeValue = transactionType.toLowerCase();
            const tType = (property.transactionType || '').toLowerCase();
            const pType = (property.propertyType || '').toLowerCase();
            const dType = (property.dynamicCategory?.name || '').toLowerCase();
            
            let isMatch = false;
            
            if (typeValue === 'buy' && (tType.includes('buy') || tType.includes('sell') || pType.includes('buy') || dType.includes('buy'))) {
                isMatch = true;
            } else if ((typeValue === 'rent' || typeValue.includes('rent')) && (tType.includes('rent') || pType.includes('rent') || dType.includes('rent'))) {
                isMatch = true;
            } else if ((typeValue === 'pg' || typeValue.includes('pg')) && (tType.includes('pg') || tType.includes('paying guest') || pType.includes('pg') || dType.includes('pg'))) {
                isMatch = true;
            } else if (tType === typeValue || pType === typeValue || dType === typeValue) {
                isMatch = true;
            }

            if (!isMatch) {
                return false;
            }
        }

        if (!localQuery) return true;
        const q = localQuery.toLowerCase();
        return (
            (property.propertyName || '').toLowerCase().includes(q) ||
            (property.propertyType || '').toLowerCase().includes(q) ||
            (property.address?.area || '').toLowerCase().includes(q) ||
            (property.address?.city || '').toLowerCase().includes(q) ||
            (property.description || '').toLowerCase().includes(q)
        );
    });

    const displayProperties = filteredProperties;


    // If no cities at all, don't render the section
    if (!citiesLoading && availableCities.length === 0) return null;

    const defaultTitle = "Handpicked Projects";
    const defaultSubtitle = `Featured projects in ${selectedCity || 'your city'}`;

    const themeMap = {
        emerald: { bg: 'bg-emerald-500', text: 'text-emerald-600', hoverText: 'hover:text-emerald-700' },
        violet: { bg: 'bg-violet-500', text: 'text-violet-600', hoverText: 'hover:text-violet-700' },
        blue: { bg: 'bg-blue-500', text: 'text-blue-600', hoverText: 'hover:text-blue-700' },
        amber: { bg: 'bg-amber-500', text: 'text-amber-600', hoverText: 'hover:text-amber-700' },
    };
    const themeConfig = theme || themeMap[themeColor] || themeMap.emerald;

    return (
        <section id="admin-properties-section" className="pt-2 pb-6 border-b border-gray-100 last:border-0">

            {/* Header */}
            <div className="mb-4">
                <div className="flex justify-between items-start md:items-end px-3 md:px-2 mb-3">
                    <div className="flex-1 min-w-0 pr-2">
                        <div className="flex items-start gap-1.5 md:gap-2 mb-0.5">
                            <div className={`w-1 h-4 md:h-5 ${themeConfig.bg} rounded-full mt-1 md:mt-0 shrink-0`} />
                            <h2 className="text-[17px] md:text-[22px] font-black text-gray-900 leading-tight">
                                {title || defaultTitle}
                            </h2>
                        </div>
                        <p className="text-[11px] md:text-[13px] text-gray-500 mt-0.5 ml-2.5 md:ml-3 truncate">
                            {subtitle || defaultSubtitle}
                        </p>
                    </div>
                    {/* Temporary hide View All for Projects until a dedicated /projects search page is built */}
                    {/*
                    {displayProperties.length > 0 && (
                        <button
                            onClick={() => {
                                let url = `/search?city=${selectedCity || ''}`;
                                if (transactionType) {
                                    url += `&transactionType=${transactionType.toLowerCase()}`;
                                } else {
                                    url += `&transactionType=all`;
                                }
                                navigate(url);
                                window.scrollTo(0, 0);
                            }}
                            className={`text-[12px] md:text-[14px] font-bold ${themeConfig.text} ${themeConfig.hoverText} hover:underline shrink-0 whitespace-nowrap mt-1 md:mt-0`}
                        >
                            View All
                        </button>
                    )}
                    */}
                </div>
            </div>

            {/* City Chips — Horizontal Scroll (Commented out as per user request)
            <div className="relative mb-6 px-5 md:px-0">

                {citiesLoading ? (
                    <div className="flex gap-3 overflow-hidden">
                        {[1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="h-9 w-24 rounded-full bg-gray-100 animate-pulse shrink-0" />
                        ))}
                    </div>
                ) : (
                    <div
                        ref={scrollRef}
                        className="flex gap-2 overflow-x-auto scrollbar-hide pb-1"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {availableCities.map((cityObj) => (
                            <motion.button
                                key={cityObj.city}
                                onClick={() => {
                                    selectCity(cityObj.city);
                                    if (cityObj.city !== 'Bengaluru') {
                                        toast(`Currently, Get-Right-Home services are only live in Bengaluru. Launching in ${cityObj.city} soon! 🚀`, {
                                            duration: 5000,
                                            icon: 'ℹ️'
                                        });
                                    }
                                }}
                                whileTap={{ scale: 0.95 }}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[12px] font-bold shrink-0 transition-all duration-200 ${selectedCity === cityObj.city
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-200'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50'
                                    }`}
                            >
                                <MapPin size={11} className={selectedCity === cityObj.city ? 'text-white' : 'text-emerald-500'} />
                                {cityObj.city}
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${selectedCity === cityObj.city
                                        ? 'bg-white/20 text-white'
                                        : 'bg-gray-100 text-gray-500'
                                    }`}>
                                    {cityObj.count}
                                </span>
                            </motion.button>
                        ))}
                    </div>
                )}

            </div>
            */}

            {/* Properties Grid */}
            <div className="md:px-0">
                {!selectedCity ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border ${theme?.text?.replace('text-', 'bg-').replace('600', '50') || 'bg-emerald-50'} ${theme?.text?.replace('text-', 'border-').replace('600', '100') || 'border-emerald-100'}`}>
                            <MapPin size={28} className={theme?.text?.replace('600', '400') || 'text-emerald-400'} />
                        </div>
                        <p className="text-sm font-bold text-gray-500">Select a city above to see properties</p>
                    </div>
                ) : loading ? (
                    <div className="flex overflow-x-hidden gap-4 pb-4 px-5 md:px-0">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="min-w-[280px] md:min-w-[320px] max-w-[320px] shrink-0">
                                <SkeletonCard />
                            </div>
                        ))}
                    </div>
                ) : (displayProperties.length === 0) ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-14 text-center bg-gray-50/60 rounded-2xl border border-dashed border-gray-200 px-5"
                    >
                        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                            <Building2 size={26} className="text-gray-300" />
                        </div>
                        {selectedCity !== 'Bengaluru' && !localQuery ? (
                            <>
                                <h3 className="font-black text-gray-700 mb-1">Coming Soon to {selectedCity}! 🚀</h3>
                                <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
                                    Currently, Get-Right-Home services are only live in <strong>Bengaluru</strong>. We will be launching in {selectedCity} soon!
                                </p>
                            </>
                        ) : localQuery ? (
                            <>
                                <h3 className="font-black text-gray-700 mb-1">No matching properties</h3>
                                <p className="text-sm text-gray-400 max-w-xs">
                                    We couldn't find any properties matching "{localQuery}" in {selectedCity}.
                                </p>
                            </>
                        ) : (
                            <>
                                <h3 className="font-black text-gray-700 mb-1">No Properties in {selectedCity}</h3>
                                <p className="text-sm text-gray-400 max-w-xs">
                                    Admin hasn't added any properties for this city yet. Try another city.
                                </p>
                            </>
                        )}
                    </motion.div>
                ) : (
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={selectedCity}
                            ref={propertiesScrollRef}
                            onScroll={handlePropertiesScroll}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 scrollbar-hide px-5 md:px-0 w-fit max-w-full"
                            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                        >
                            {displayProperties.slice(0, 8).map((property, index) => (
                                <AdminPropertyCard key={property._id} property={property} index={index} theme={themeConfig} />
                            ))}
                        </motion.div>
                    </AnimatePresence>
                )}


            </div>
        </section>
    );
};

export default AdminPropertiesSection;
