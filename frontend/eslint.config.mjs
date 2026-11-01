// ESLint 9 flat config.
//
// This replaced .eslintrc.json during the Next 16 upgrade: eslint-config-next@16
// requires ESLint 9, and 9 no longer reads the old format. `next lint` was also
// removed in Next 16, so the npm script now calls eslint directly.
import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...coreWebVitals,

  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "public/sw.js"],
  },

  {
    rules: {
      // A warning rather than an error, deliberately.
      //
      // The rule is new with React 19's compiler lints and it is a good one in
      // general: setting state synchronously in an effect can cascade renders.
      // But it cannot tell that case apart from the one it fires on here, which
      // is reading a value that only exists in a browser — navigator.onLine,
      // localStorage — and putting it into state after mount. That is the
      // pattern React itself prescribes for server-rendered pages, because
      // those values cannot be read during render at all.
      //
      // All eight current sites are that pattern. Restructuring working code to
      // satisfy a rule it does not actually apply to, in the same change as a
      // major framework upgrade, is how an upgrade turns into an outage. Left
      // visible as a warning so a genuine cascading-render bug still surfaces.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;
