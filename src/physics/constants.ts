/**
 * Physical constants and astronomical data, at the precision a first-year course computes with
 * (three significant figures, from CODATA 2018 and the IAU nominal values). Every number a student
 * computes in the course, every numeric answer and every `commonWrong` value is computed with these,
 * so a question never disagrees with its own key by a rounding step.
 *
 * The 77101 exam publishes no formula sheet that we have read. If one is found (/exam-map), its values
 * replace these and the answer keys are recomputed.
 *
 * Never type a constant inline; import it.
 */

/** Free-fall acceleration near the Earth's surface [m/s²]. */
export const G = 9.8;

/** Gravitational constant [N·m²/kg²]. */
export const G_NEWTON = 6.67e-11;

/** Speed of light in vacuum [m/s]. */
export const C_LIGHT = 3.0e8;

/** Elementary charge [C]; also joules per electron-volt. */
export const E_CHARGE = 1.6e-19;

/** Electron mass [kg]; rest energy ≈ 0.511 MeV. */
export const M_ELECTRON = 9.11e-31;

/** Proton mass [kg]; rest energy ≈ 938 MeV. */
export const M_PROTON = 1.67e-27;

/** Earth: mass [kg], mean radius [m], sidereal rotation rate [rad/s]. */
export const M_EARTH = 5.97e24;
export const R_EARTH = 6.37e6;
export const OMEGA_EARTH = 7.29e-5;

/** Moon: mass [kg], radius [m], mean Earth–Moon distance [m]. */
export const M_MOON = 7.35e22;
export const R_MOON = 1.74e6;
export const D_EARTH_MOON = 3.84e8;

/** Sun: mass [kg], radius [m]; astronomical unit [m]. */
export const M_SUN = 1.99e30;
export const R_SUN = 6.96e8;
export const AU = 1.5e11;

/** One year [s] (365.25 days) and one day [s]. */
export const YEAR = 3.156e7;
export const DAY = 86400;
