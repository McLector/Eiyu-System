// Runs after the test framework is installed, in every suite.
// Testing Library's async helpers (waitFor, findBy*) give up after 1 s by default. The store and hook suites
// render the whole provider and chain several async steps, and on a loaded machine (or a small CI runner) that
// is not enough. A longer deadline costs nothing when the condition is met and only delays a genuine failure.
const { configure } = require('@testing-library/react-native');

configure({ asyncUtilTimeout: 5000 });
