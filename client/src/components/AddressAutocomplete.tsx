import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { FormControl } from "@/components/ui/form";

interface AddressDetails {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface AddressAutocompleteProps {
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  placeholder?: string;
  onAddressSelect?: (addressDetails: AddressDetails) => void;
  "data-testid"?: string;
}

declare global {
  interface Window {
    google?: any;
    loadGoogleMapsAPI?: () => Promise<void>;
  }
}

export default function AddressAutocomplete({
  value = "",
  onChange,
  onBlur,
  name,
  placeholder = "Enter street address",
  onAddressSelect,
  "data-testid": dataTestId,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  // Load Google Maps API
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      console.warn("Google Places API key not found");
      return;
    }

    const loadAPI = async () => {
      try {
        // Check if Google Maps is already loaded
        if (window.google && window.google.maps && window.google.maps.places) {
          setIsGoogleLoaded(true);
          return;
        }

        // Load the API dynamically
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
        script.async = true;
        script.defer = true;
        
        script.onload = () => {
          setIsGoogleLoaded(true);
        };
        
        script.onerror = () => {
          console.error("Failed to load Google Maps API");
        };

        document.head.appendChild(script);
      } catch (error) {
        console.error("Error loading Google Maps API:", error);
      }
    };

    loadAPI();
  }, []);

  // Initialize autocomplete when Google API is loaded
  useEffect(() => {
    if (!isGoogleLoaded || !inputRef.current || !window.google?.maps?.places) {
      return;
    }

    try {
      // Create autocomplete instance
      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        inputRef.current,
        {
          types: ['address'],
          componentRestrictions: { country: 'us' }, // Restrict to US addresses
          fields: ['address_components', 'formatted_address', 'geometry']
        }
      );

      // Listen for place selection
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace();
        
        if (!place?.address_components) {
          return;
        }

        // Extract address components
        const components = place.address_components;
        const addressDetails: AddressDetails = {
          street: "",
          city: "",
          state: "",
          zipCode: "",
          country: "US"
        };

        // Parse address components
        for (const component of components) {
          const types = component.types;
          
          if (types.includes('street_number')) {
            addressDetails.street = component.long_name + " ";
          } else if (types.includes('route')) {
            addressDetails.street += component.long_name;
          } else if (types.includes('locality')) {
            addressDetails.city = component.long_name;
          } else if (types.includes('administrative_area_level_1')) {
            addressDetails.state = component.short_name;
          } else if (types.includes('postal_code')) {
            addressDetails.zipCode = component.long_name;
          } else if (types.includes('country')) {
            addressDetails.country = component.short_name;
          }
        }

        // Clean up street address
        addressDetails.street = addressDetails.street.trim();
        
        // Update input value with formatted address
        const formattedStreet = addressDetails.street;
        setInputValue(formattedStreet);
        onChange?.(formattedStreet);
        
        // Call the callback with all address details
        onAddressSelect?.(addressDetails);
      });

    } catch (error) {
      console.error("Error initializing Google Places Autocomplete:", error);
    }

    // Cleanup
    return () => {
      if (autocompleteRef.current) {
        window.google?.maps?.event?.clearInstanceListeners?.(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [isGoogleLoaded, onChange, onAddressSelect]);

  // Update input value when prop changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange?.(newValue);
  };

  return (
    <FormControl>
      <Input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={onBlur}
        name={name}
        placeholder={placeholder}
        data-testid={dataTestId}
        autoComplete="off"
      />
    </FormControl>
  );
}