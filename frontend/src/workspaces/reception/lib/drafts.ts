// One drafts module for the whole app. The sign-in code (context/AuthContext.tsx) tells the shared
// module who is signed in; a separate copy here never heard it, so every draft was filed under
// "anon" instead of under the user who typed it.
export * from '../../../lib/drafts';
