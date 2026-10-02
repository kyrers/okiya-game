# Notes for the maintainer

- **Commits in this session are unsigned.** The repo/user git config asks for GPG signing,
  but the signing key needs an interactive pinentry prompt and nobody was available to
  answer it, so each commit was made with `git -c commit.gpgsign=false commit`. Re-sign
  with `git rebase --exec 'git commit --amend --no-edit -S' --root` if you need signatures.
