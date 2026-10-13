import { brandById, brandPref, type Brand } from './brands';
import { usePref } from './usePref';

export function useBrand(): Brand {
    return brandById(usePref(brandPref));
}
