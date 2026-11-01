import React from 'react';
import type { Brand } from './brands';

/**
 * The brand's wordmark (Brass Instrument, Ruling P1): the whole name in one colour, serif -- both parts are spans so
 * the name keeps its two-part structure, but design.css sets the colour (accent-text) on the wordmark and no part
 * has a colour of its own.
 */
const Wordmark: React.FC<{ brand: Brand }> = ({ brand }) => (
    <span className="ql-wordmark">
        <span className="ql-wordmark-first">{brand.parts[0]}</span>
        <span className="ql-wordmark-second">{brand.parts[1]}</span>
    </span>
);

export default Wordmark;
