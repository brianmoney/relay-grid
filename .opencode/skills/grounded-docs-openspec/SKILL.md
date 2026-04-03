---
name: grounded-docs-openspec
description: Search the repo's OpenSpec markdown through the grounded-docs MCP index `relay-grid` first, then use local file tools only when you need full-file context, verification, or edits.
compatibility: opencode
---

Search grounded-docs first for OpenSpec content in this repo. Use local file reads only after search results identify the relevant document, or when you need full-file inspection, verification, or edits.

## Use this skill when
- You need to inspect OpenSpec proposals, designs, tasks, or spec files that have been indexed into grounded-docs
- You want fast repo-document lookup by concept instead of manually browsing `openspec/**/*.md`
- You need to answer questions about requirements, scope, change history, or capability definitions from OpenSpec docs

## Repo-specific context
- The grounded-docs library/index name for this repo is `relay-grid`
- The indexed content includes OpenSpec markdown under `openspec/`
- Searches can return `file:///local-code/relay-grid/...` URLs that map back to files in this repository

## Preferred workflow
1. Use `grounded-docs_find_version` with `library: "relay-grid"` if you need to confirm the index exists.
2. Use `grounded-docs_search_docs` with `library: "relay-grid"` and a targeted query describing the capability, change, or requirement.
3. Prefer concept-driven queries such as:
   - `service foundation spec requirements`
   - `OpenSpec change workflow proposal design tasks spec`
   - `Slack ingestion requirements`
   - `<change-name> proposal`
   - `<capability-name> spec`
4. Use the returned file URLs and excerpts to answer the question or decide which local file to inspect more deeply.

## Query guidance
- Search by capability name, change name, artifact type, or requirement wording
- Start broad, then refine using exact OpenSpec terms from earlier results
- Prefer grounded-docs search over filesystem search when the task is primarily about OpenSpec document contents
- Fall back to local file reads only when you need full-file context or want to edit an artifact

## Output checklist
- Search query or queries used
- Relevant result paths or artifact names
- Concise summary of the requirement/design/task detail found
- Note whether local file reads are still needed
