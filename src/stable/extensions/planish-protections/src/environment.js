// SPDX-License-Identifier: Apache-2.0
// The session environment: what agents' programs, and every command they run that keeps its
// environment, see. It stops the waits newcomers cannot see, pagers and git's password prompt,
// and names the session, so the agents' hooks can tell a Planish session from another.
'use strict';

/** The variables a session sets, for its id and temp folder. */
function sessionEnvironment({ id, folder }, platform = process.platform) {
  return {
    PLANISH_SESSION: id,
    TMPDIR: folder,
    TMP: folder,
    TEMP: folder,
    // git and GitHub's CLI take "cat" as no pager on every platform; Windows has no cat for others.
    GIT_PAGER: 'cat',
    GH_PAGER: 'cat',
    AWS_PAGER: '',
    ...(platform === 'win32' ? {} : { PAGER: 'cat', MANPAGER: 'cat', SYSTEMD_PAGER: 'cat' }),
    GIT_TERMINAL_PROMPT: '0',
  };
}

module.exports = { sessionEnvironment };
