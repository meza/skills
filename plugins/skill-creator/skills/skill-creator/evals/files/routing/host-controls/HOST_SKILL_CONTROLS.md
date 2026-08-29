# Host skill controls

The host catalog is controlled by `skills.toml`. Each `[[skills]]` record is
selected using the host-supplied `identity` and `provenance` fields together.

To disable one catalog entry after the user explicitly authorizes the change,
set `enabled = false` on the record matching both the requested identity and
provenance. Do not select records using filenames, directory names, locations,
provider names, or ordering. Leave every non-matching record unchanged.
