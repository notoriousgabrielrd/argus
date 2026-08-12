// Why: Argus disables upstream egress (auto-updater, Orca Cloud/relay, star probe) behind
// env guards that default off in production. Unit tests must keep exercising the preserved
// upstream machinery so future upstream merges stay verifiable — opt back in here, test-wide.
process.env.ARGUS_ENABLE_UPDATER = '1'
process.env.ARGUS_ENABLE_ORCA_CLOUD = '1'
process.env.ARGUS_ENABLE_STAR_PROBE = '1'
process.env.ARGUS_ENABLE_FEEDBACK_UPLOAD = '1'
