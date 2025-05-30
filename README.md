# Quantum Functions Module (`src/quantum_functions.js`)

This module provides core mathematical functions necessary for calculating and visualizing hydrogen-like atomic orbitals. Below are the key assumptions and conventions used in this implementation to ensure clarity and consistency.

---

## 1. Unit System for Radial Distance (`r`)

* **Atomic Units (Bohr Radii):** The `radialWaveFunction` assumes that the input distance `r` is provided in **atomic units**, specifically in multiples of the Bohr radius ($a_0$).
    * This means that if you're working with distances in SI units (e.g., nanometers or meters), you'll need to convert them to Bohr radii *before* passing them to `radialWaveFunction`.
    * *Rationale:* This simplifies the mathematical formulas for the radial wave function by effectively setting $a_0 = 1$, making the expressions cleaner and more direct translations of the theoretical atomic unit equations.

---

## 2. Conventions for Associated Legendre Polynomials (`associatedLegendrePolynomial`)

* **Non-Negative Order (`m`):** The function always expects a non-negative value for the `m` parameter. For calculations involving the magnetic quantum number ($m_l$), its absolute value ($|m_l|$) should be passed as `m`.
* **No Condon-Shortley Phase:** The `associatedLegendrePolynomial` function itself **does not include the Condon-Shortley phase factor $(-1)^m$** in its definition.
    * *Rationale:* This convention was chosen to ensure direct compatibility with the standard formulas used for constructing **real spherical harmonics** ($Y_{lm_l}(\theta, \phi)$), where any necessary phase adjustments are incorporated into the real spherical harmonic combinations rather than the Legendre polynomial itself. This helps in directly yielding positive values for the $P_l^m(x)$ terms when $x$ is positive, aligning with common textbook derivations for real orbitals.

---

## 3. Conventions for Real Spherical Harmonics (`realSphericalHarmonic`)

* **Real Forms:** This function calculates **real spherical harmonics**, which are linear combinations of the complex spherical harmonics designed to produce real-valued orbital shapes suitable for visualization (e.g., $p_x$, $p_y$, $p_z$, $d_{xy}$, $d_{xz}$, $d_{yz}$, $d_{z^2}$, $d_{x^2-y^2}$).
* **Angle Units:** Input angles `theta` (polar) and `phi` (azimuthal) are expected to be in **radians**.
    * `theta` range: $[0, \pi]$
    * `phi` range: $[0, 2\pi)$
* **Normalization:** The real spherical harmonics include the appropriate normalization factors to ensure they are orthonormal.

---

## 4. Quantum Number Validations

* All functions that accept quantum numbers (`n`, `l`, `ml`) perform strict input validation to ensure they are positive integers and adhere to the physical rules (e.g., $1 \le n$, $0 \le l \le n-1$, $-l \le m_l \le l$). Errors will be thrown for invalid inputs.

---

## 5. Memoization for Efficiency

* All computationally intensive functions (`factorial`, `pochhammer`, `laguerrePolynomial`, `associatedLegendrePolynomial`, `realSphericalHarmonic`) utilize **memoization (caching)**. This significantly improves performance by storing the results of function calls and returning the cached value for subsequent calls with the same inputs, avoiding redundant calculations. A `__clearAllCaches__` function is provided for testing or resetting.