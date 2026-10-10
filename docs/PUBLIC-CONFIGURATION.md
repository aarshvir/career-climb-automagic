# Portable public frontend configuration

`.env.production` contains only the existing Jobvance Supabase URL and verified anonymous/publishable browser key. These values are already delivered to every visitor by the frontend. They are not administrative credentials. Including them keeps Lovable, CI and other frontend builds reproducible without exposing server keys. Host environment settings may override these public values for a separate project.

The build validator rejects privileged keys. The database and private bucket enforce account ownership regardless of knowledge of the browser key; billing grants and privileged functions are server-only. Server credentials, processor keys and webhook secrets must remain in Supabase's private environment. Do not add them to any `VITE_` field or committed environment file.

`node scripts/save-public-config.mjs` can reproduce the public configuration from the existing local public settings. It rejects an unrelated project or non-anonymous JWT. No key values are printed.
