import { useEffect, useState } from 'react';
import { getEnabledProviders, subscribeEnabledProviders } from '../services/providersService';

export const useEnabledProviders = () => {
  const [enabledProviders, setEnabledProviders] = useState(getEnabledProviders);

  useEffect(() => {
    const unsubscribe = subscribeEnabledProviders(() => {
      setEnabledProviders(getEnabledProviders());
    });

    return unsubscribe;
  }, []);

  return enabledProviders;
};
