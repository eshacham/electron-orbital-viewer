import React from 'react';
import ExpandMore from '@mui/icons-material/ExpandMore';

/**
 * The trailing chevron of a <details> summary (final fix wave, finish fix 1): the Info "How this was computed"
 * disclosure's, for every other disclosure in the app. Decorative -- the browser's own open state names the control --
 * so it is aria-hidden; it turns over when open (style.css `.disclosure-chevron`).
 */
const DisclosureChevron: React.FC = () => <ExpandMore className="disclosure-chevron" fontSize="small" aria-hidden="true" />;

export default DisclosureChevron;
