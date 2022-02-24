---
title: "Using This Knowledge Base"
linkTitle: "Using This Knowledge Base"
keywords:
- clickhouse updates
- clickhouse contributions
description: >
    Add pages, make updates, and contribute to this ClickHouse knowledge base.
weight: 12
---
The Altinity Knowledge Base is built on GitHub Pages, using Hugo and Docsy.  This guide provides a brief description on how to make updates and add to this knowledge base.

## Page and Section Basics

The knowledge base is structured in a simple directory format, with the content of the Knowledge Base stored under the directory `content/en`.

Each section is a directory, with the file `_index.md` that provides that sections information.  For example, the `Upgrade` section has the following layout:

```bash
├── upgrade
│   ├── _index.md
│   └── removing-empty-parts.md
```

Each Markdown file provides the section's information and the title that is displayed on the left navigation panel, with the file `_index.md` providing the top level information on the section.

Each page is set in the following format that sets the page attributes:

```yaml
---
title: "Using This Knowledge Base"
linkTitle: "Using This Knowledge Base"
description: >
    How to add pages, make updates, and expand this knowledge base.
weight: 11
---
The content of the page in Markdown format.
```

The attributes are as follows:

* **title**: The title of the page displayed at the top of the page.
* **linkTitle**: The title used in the left navigation panel.
* **description**:  A short description of the page listed under the title.
* **weight**: The placement of the page in the hierarchy in the left navigation panel.  The higher the weight, the higher in the display order it will be.  For example, the file `engines/_index.md` has a weight of `1`, pushing its display to the top of the list.

## Create Pages and Sections

### Create or Edit A Page

To create a new page or edit an existing one in the knowledge base:

1. From the page to start from:
    1. To create a new page, select **Create child page**.
    1. To edit an existing page, select **Edit this page**.
1. This will open the page's location in the GitHub repository.  Update the page using Markdown.  See the Docsy Formatting Options section below for tips and details.
    1. View how the page will look **Preview**.  The GitHub Preview is not 100% the same as the page will be displayed on the knowledge base, but it is a close enough approximation.
1. Saving the file will depend on your role.
    1. For those who have been granted **Knowledgebase Contributor** status, select **Commit New File**.  The changes will be automatically applied to the GitHub repository, and the additions will be displayed to the knowledge base within 1-5 minutes.
    1. For those who have not been granted **Knowledgebase Contributor** status, they will have to fork the changes and then create a new pull request through the following process:
        1. When editing is complete, select **Propose New File**.  This will being you to the **GitHub Pull Request** page.
        1. Verify the new file is accurate, then select **Create Pull Request**.
        1. Name the Pull Request, then select **Create pull request**.
        1. First time contributors will be required to review and sign the [Contributor License Agreement(CLA)](https://altinity.com/legal/content-licensing-agreement-cla/).  To signify they agree with the CLA, the following comment must be left as part of the pull request:

            ```text
            I have read the CLA Document and I hereby sign the CLA
            ```

        This signature will be stored as part of the GitHub repository indicating the GitHub username, the date of the agreement, and the pull request where the signer indicated their consent with the CLA.

        1. The Pull Request will be reviewed and if approved, the changes will be applied to the Knowledge Base.

### Create a New Section

To create a new section in the knowledge base, add a new directory under `content/en` from either the [GitHub Repository](https://github.com/Altinity/altinityknowledgebase/tree/main) or through some other GitHub related method., and add the file `index.md`.  The same submission process will be followed as outlined in [Create or Edit A Page](#create-or-edit-a-page).

## Docsy Formatting Options

Docsy uses [Markdown](https://www.markdownguide.org/getting-started/), providing a simple method of formatting documents.  Refer to the Markdown documentation for how to edit pages and achieve the display results.

The following guide recommendations should be followed:

* Code should should be code segments, which uses three back tics to start and end a code section, with the type of code used.  For example, if the code segment is regarding SQL then the section would start with \`\`\`sql` .
* Display text should be in **bold**.  For example, when requesting someone click Create New Page on a page, **Create New Page** is in bold.

### Adding Images

New images and other static files are stored in the directory `static`, with the following categories:

* Images are stored under `static/assets`.
* Pdf files are stored under `static/assets`
