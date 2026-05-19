'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

interface GooglePlacesAutocompleteProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    /** Bias results toward Israel */
    regionBias?: string;
}

interface Prediction {
    place_id: string;
    description: string;
    structured_formatting: {
        main_text: string;
        secondary_text: string;
    };
}

// Singleton: load Google Maps script once globally
let googleMapsLoading = false;
let googleMapsLoaded = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMapsScript(apiKey: string): Promise<void> {
    return new Promise((resolve) => {
        if (googleMapsLoaded) {
            resolve();
            return;
        }
        loadCallbacks.push(resolve);
        if (googleMapsLoading) return;

        googleMapsLoading = true;
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=he`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            googleMapsLoaded = true;
            googleMapsLoading = false;
            loadCallbacks.forEach(cb => cb());
            loadCallbacks.length = 0;
        };
        script.onerror = () => {
            googleMapsLoading = false;
            // Still resolve — the component will degrade to a plain text input
            loadCallbacks.forEach(cb => cb());
            loadCallbacks.length = 0;
        };
        document.head.appendChild(script);
    });
}

export default function GooglePlacesAutocomplete({
    value,
    onChange,
    placeholder = 'חפש מיקום...',
    className = '',
    regionBias = 'il',
}: GooglePlacesAutocompleteProps) {
    const [predictions, setPredictions] = useState<Prediction[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    useEffect(() => {
        if (!apiKey) return;
        loadGoogleMapsScript(apiKey).then(() => {
            if (window.google?.maps?.places) {
                autocompleteService.current = new window.google.maps.places.AutocompleteService();
                setIsReady(true);
            }
        });
    }, [apiKey]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const fetchPredictions = useCallback((input: string) => {
        if (!autocompleteService.current || !input.trim()) {
            setPredictions([]);
            return;
        }

        setLoading(true);
        autocompleteService.current.getPlacePredictions(
            {
                input,
                componentRestrictions: regionBias ? { country: regionBias } : undefined,
                types: ['establishment', 'geocode'],
            },
            (results, status) => {
                setLoading(false);
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    setPredictions(results as unknown as Prediction[]);
                    setIsOpen(true);
                } else {
                    setPredictions([]);
                }
            }
        );
    }, [regionBias]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        onChange(val);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!isReady) return;

        debounceRef.current = setTimeout(() => {
            fetchPredictions(val);
        }, 300);
    };

    const handleSelect = (prediction: Prediction) => {
        onChange(prediction.description);
        setIsOpen(false);
        setPredictions([]);
    };

    // If no API key, render a plain text input
    if (!apiKey) {
        return (
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className={className}
            />
        );
    }

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <input
                    type="text"
                    value={value}
                    onChange={handleInputChange}
                    onFocus={() => predictions.length > 0 && setIsOpen(true)}
                    placeholder={placeholder}
                    className={className}
                    autoComplete="off"
                />
                {loading && (
                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        <Loader2 size={14} className="animate-spin text-slate-400" />
                    </div>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && predictions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-xl max-h-52 overflow-y-auto" dir="rtl">
                    {predictions.map((p) => (
                        <button
                            key={p.place_id}
                            type="button"
                            onClick={() => handleSelect(p)}
                            className="w-full text-right px-3 py-2.5 hover:bg-purple-50 transition-colors flex items-start gap-2.5 border-b border-slate-50 last:border-b-0"
                        >
                            <MapPin size={14} className="text-purple-400 mt-0.5 shrink-0" />
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-800 truncate">
                                    {p.structured_formatting.main_text}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                    {p.structured_formatting.secondary_text}
                                </div>
                            </div>
                        </button>
                    ))}
                    <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100">
                        <img
                            src="https://developers.google.com/static/maps/documentation/images/powered_by_google_on_white.png"
                            alt="Powered by Google"
                            className="h-3 opacity-50"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
