// Whether a slice must leave tests behind. The project sets a policy and a slice may override it.
//   required  a work slice cannot close without tests
//   optional  it can, and the missing tests become a proposed debt entry (the default, as in Spec Kit)
//   none      tests are not asked for and nothing is proposed

export const TEST_POLICIES = ['required', 'optional', 'none'];

/** The policy that applies to a slice: its own, else the project's, else optional. Takes the parsed `data` of each. */
export const testPolicy = (blueprint, slice) => slice?.test_policy ?? blueprint?.test_policy ?? 'optional';
