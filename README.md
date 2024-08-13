# Welcome

Welcome to the Altinity Knowledgebase Repository!  This Knowledgebase was established for Altinity Engineers and ClickHouse community members to work together to find common solutions.

Submissions and merges to this repository are distributed at https://kb.altinity.com .

This knowledgebase is licensed under Apache 2.0.  Contributors who submit to the Altinity Knowledgebase agree to the Altinity Contribution License Agreement.

## How This Site is Rendered

This site is rendered using [Hugo](https://gohugo.io/) and the [Docsy theme](https://www.docsy.dev/).

To test out the site on a local system:

1. Download the entire repo.
1. Install `hugo`.
1. From the command line, run `npm install` to allocate the proper packages locally.
1. From the command line, run `git submodule update --init --recursive` to populate the Docsy theme.
1. Edit the contents of the `./content/en` directory.  To add images/pdfs/etc , those go into `./static`.
1. To view the web page locally to verify how it looks, use `hugo server` and the web page will be displayed from `./docs` as a local server on `http://localhost:1313`.

## How This Site Is Served

Merges into the `main` branch are run through a Github workflow, and the results are rendered into the branch `altinity-knowledgebase`.  The GitHub pages are served from that branch.  Members of the Altinity Knowledge Base team can directly contribute to the Knowledge Base.  Other users will submit pull requests and agree to the CLA before their pull request will be accepted.
