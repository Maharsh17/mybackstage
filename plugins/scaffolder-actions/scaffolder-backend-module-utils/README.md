# scaffolder-backend-module-utils actions package

## Intro

Welcome to the roadie `utils` actions for the `scaffolder-backend`.

This contains a collection of actions to use in scaffolder templates:

- [Zip](#zip)
- [Sleep](#sleep)
- [Deserialise a file](#deserialise)
- [Serialise to JSON or YAML](#serialise)
- [Parse and Transform JSON or YAML](#parse-and-transform-json-or-yaml)
- [Merge new data into an existing JSON file](#merge-json)
- [Append content to a file](#append)
- [Write content to a file](#write-to-file)

## Setup

## Setting up Backstage

Create your Backstage application using the Backstage CLI as described here:
https://backstage.io/docs/getting-started/create-an-app

> Note: If you are using this plugin in a Backstage monorepo that contains the code for `@backstage/plugin-scaffolder-backend`, you need to modify your internal build processes to transpile files from the `node_modules` folder as well.

You need to configure the action in your backend:

### Installing the actions

```
cd packages/backend
yarn add @roadiehq/scaffolder-backend-module-utils
```

Configure the action:
(you can check the [docs](https://backstage.io/docs/features/software-templates/writing-custom-actions#registering-custom-actions) to see all options):

Here you can pick the actions that you'd like to register to your backstage instance.

```typescript
// packages/backend/src/plugins/scaffolder.ts
import {
  createZipAction,
  createSleepAction,
  createWriteFileAction,
  createAppendFileAction,
  createMergeJSONAction,
  createMergeAction,
  createParseFileAction,
  createSerializeYamlAction,
  createSerializeJsonAction,
  createJSONataAction,
  createYamlJSONataTransformAction,
  createJsonJSONataTransformAction,
} from '@roadiehq/scaffolder-backend-module-utils';
...

const actions = [
  createZipAction(),
  createSleepAction(),
  createWriteFileAction(),
  createAppendFileAction(),
  createMergeJSONAction({}),
  createMergeAction(),
  createAwsS3CpAction(),
  createEcrAction(),
  createParseFileAction(),
  createSerializeYamlAction(),
  createSerializeJsonAction(),
  createJSONataAction(),
  createYamlJSONataTransformAction(),
  createJsonJSONataTransformAction(),
  ...createBuiltinActions({
    containerRunner,
    integrations,
    config,
    catalogClient,
    reader,
  }),
];

return await createRouter({
  containerRunner,
  logger,
  config,
  database,
  catalogClient,
  reader,
  actions,
});
```

## Actions:

### Zip

**Action name**: `roadiehq:utils:zip`

Compress files and store them to the temporary workspace in .zip format.

_Required Params:_

- path: The path in your workspace of the file you want to zip
- outputPath: The path you want to use to save the generated zip file.

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: zip-dummy
  title: My custom zip action
  description: scaffolder action to zip the current context?
spec:
  owner: roadie
  type: service

  parameters:
    - title: Zip
      properties:
        path:
          title: Path
          type: string
          description: Workspace path to zip
        outputPath:
          title: Path
          type: string
          description: The path of the zip file

  steps:
    - id: zip
      name: Zip
      action: roadiehq:utils:zip
      input:
        path: ${{ parameters.path }}
        outputPath: ${{ parameters.outputPath }}

  output:
    outputPath: ${{ steps.zip.output.path }}
```

### Sleep

**Action name**: `roadiehq:utils:sleep`

Waits a number of seconds before continuing to the next scaffolder step.

_Required params:_

- amount: Number of seconds to sleep

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: sleep-dummy
  title: Sleep template
  description: A template with only one sleep example action that will ask for a user input for the amount of seconds it should sleep
spec:
  owner: roadie
  type: service

  parameters:
    - title: Sleep
      properties:
        amount:
          title: Amount to sleep
          type: number
          description: Will sleep for this amount of seconds

  steps:
    - id: sleep
      name: sleep
      action: roadiehq:utils:sleep
      input:
        path: ${{ parameters.amount }}
```

### Deserialise

**Action name**: `roadiehq:utils:fs:parse`

This action deserialises JSON or YAML files in the temporary scaffolder workspace to a JavaScript object in memory that can then be passed to another step.

Required params:

- path: The path to the file in the temporary scaffolder workspace that you want to de-serialaise
- parser: The type of content found in the file you want to de-serialise

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: parse-file-template
  title: Parse From File
  description: Example template to parse from a file with on the given path with the given content in the workspace.
spec:
  owner: roadie
  type: service

  parameters:
    - title: Parse From File
      properties:
        path:
          title: Path
          type: string
          description: The path to the file
        parser:
          title: Parser
          type: string
          enum:
            - yaml
            - json
            - multiyaml
          description: The content to parse from the file
  steps:
    - id: parsefile
      name: Parse File
      action: roadiehq:utils:fs:parse
      input:
        path: ${{ parameters.path }}
        parser: ${{ parameters.parser }}
  output:
    content: ${{ steps.serialize.output.content }}
```

### Serialise to JSON or YAML

Action: `roadiehq:utils:serialize:[json|yaml]`

This action creates a JSON or YAML formatted string representation of key value pairs written in yaml under the data input field.

#### To yaml:

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: serialize
  title: serialize
  description: Example template to serialize data to the YAML format
spec:
  owner: roadie
  type: service

  parameters: []
  steps:
    - id: serialize
      name: serialize
      action: roadiehq:utils:serialize:yaml
      input:
        data:
          hello: world
  output:
    yaml: ${{ steps.serialize.output.serialized }}
```

// input:

```js
{
  hello: 'world';
}
```

// output:

```yaml
---
hello: world
```

#### To JSON:

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: serialize
  title: Jsonata
  description: Example template to serialize data to the JSON format
spec:
  owner: roadie
  type: service

  parameters: []
  steps:
    - id: serialize
      name: serialize
      action: roadiehq:utils:serialize:json
      input:
        data:
          hello: world
  output:
    json: ${{ steps.serialize.output.serialized }}
```

// input:

```js
{
  hello: 'world';
}
```

// output: `"\"hello\": \"world\""`

### Parse and Transform JSON or YAML

**Action name**: `roadiehq:utils:jsonata`

This action allows you to use [Jsonata](https://jsonata.org/) to parse and transform JSON or YAML for use in subsequent actions.

NB: You can test Jsonata expressions [here](https://try.jsonata.org/) while writing your template.

Transform a JSON object:

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: Jsonata
  title: Jsonata
  description: Example template to perform a jsonata expression on input data
spec:
  owner: roadie
  type: service

  parameters: []
  steps:
    - id: jsonata
      name: Parse File
      action: roadiehq:utils:jsonata
      input:
        data:
          items:
            - item1
        expression: '$ ~> | $ | { "items": [items, "item2"] }|'
  output:
    result: ${{ steps.serialize.output.result }}
```

Transform a JSON file:

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: Jsonata
  title: Jsonata
  description: Example template to perform a jsonata expression on input data
spec:
  owner: roadie
  type: service

  parameters: []
  steps:
    - id: jsonata
      name: Parse File
      action: roadiehq:utils:jsonata:json:transform
      input:
        path: input-data.jaon
        expression: '$ ~> | $ | { "items": [items, "item2"] }|'
  output:
    result: ${{ steps.serialize.output.result }}
```

Transform a YAML file:

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: Jsonata
  title: Jsonata
  description: Example template to perform a jsonata expression on input data
spec:
  owner: roadie
  type: service

  parameters: []
  steps:
    - id: jsonata
      name: Jsonata
      action: roadiehq:utils:jsonata:yaml:transform
      input:
        path: input-data.yaml
        expression: '$ ~> | $ | { "items": [items, "item2"] }|'
  output:
    result: ${{ steps.serialize.output.result }}
```

### Merge JSON

**Action name**: `roadiehq:utils:json:merge`

**Required params:**

- path: The file path for the JSON you want to edit.
- content: The JSON you want to merge in, as a string or a YAML object.

#### Example Merge JSON template using an object input

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: merge-json-template
  title: Add Node Engine constraints to package.json
  description: Merge in some JSON to an existing file and open a pull request for it.
spec:
  owner: roadie
  type: service

  parameters:
    properties:
      repository:
        title: Repository name
        type: string
        description: The name of the repository
      org:
        title: Repository Organisation
        type: string
        description: The Github org that the repository is in
      pr_branch:
        title: PR Branch
        type: string
        description: The new branch to make a pr from
      path:
        title: Path
        type: string
        description: The path to the desired new file
      version:
        title: Node Engine Version
        type: string
        description: Add an engine version constraint to the package.json

  steps:
    - id: fetch-repo
      name: Fetch repo
      action: fetch:plain
      input:
        url: 'https://github.com/${{ parameters.org }}/${{ parameters.repository }}'
    - id: merge
      name: Merge JSON
      action: roadiehq:utils:json:merge
      input:
        path: ${{ parameters.path }}
        content:
          engines:
            node: ${{ parameters.version }}
    - id: publish-pr
      name: Publish PR
      action: publish:github:pull-request
      input:
        repoUrl: github.com?repo=${{ parameters.repository }}&owner=${{ parameters.org }}
        branchName: ${{ parameters.pr_branch }}
        title: Specify Node Engine Versions ${{ parameters.path }}
        description: This PR was created by a Backstage scaffolder task
    - id: log-message
      name: Log PR URL
      action: debug:log
      input:
        message: 'RemoteURL: ${{ steps["publish-pr"].output.remoteUrl }}'
```

#### Example Merge JSON template using string input

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: merge-json-template
  title: Merge in JSON
  description: Merge in some JSON to an existing file and open a pull request for it.
spec:
  owner: roadie
  type: service

  parameters:
    properties:
      repository:
        title: Repository name
        type: string
        description: The name of the repository
      org:
        title: Repository Organisation
        type: string
        description: The Github org that the repository is in
      pr_branch:
        title: PR Branch
        type: string
        description: The new branch to make a pr from
      path:
        title: Path
        type: string
        description: The path to the desired new file
      content:
        title: JSON
        type: string
        description: JSON to merge in
        ui:widget: textarea
        ui:options:
          rows: 10
        ui:placeholder: |
          {"hello": "world"}
  steps:
    - id: fetch-repo
      name: Fetch repo
      action: fetch:plain
      input:
        url: 'https://github.com/${{ parameters.org }}/${{ parameters.repository }}'
    - id: merge
      name: Merge JSON
      action: roadiehq:utils:json:merge
      input:
        path: ${{ parameters.path }}
        content: ${{ parameters.content }}
    - id: publish-pr
      name: Publish PR
      action: publish:github:pull-request
      input:
        repoUrl: github.com?repo=${{ parameters.repository }}&owner=${{ parameters.org }}
        branchName: ${{ parameters.pr_branch }}
        title: Merge JSON into ${{ parameters.path }}
        description: This PR was created by a Backstage scaffolder task
    - id: log-message
      name: Log PR URL
      action: debug:log
      input:
        message: 'RemoteURL: ${{ steps["publish-pr"].output.remoteUrl }}'
```

### Append

**Action name**: `roadiehq:utils:fs:append`

This action adds content to the end of an existing file or creates a new one if it doesn't already exist.

_Required params:_

- path: The path of the file you want to add content to in the workspace.
- content: The string content you want to append.

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: append-file-template
  title: Append To File template
  description: Example template to append to a file with on the given path with the given content in the workspace.
spec:
  owner: roadie
  type: service

  parameters:
    - title: Append To File
      properties:
        path:
          title: Path
          type: string
          description: The path to the file
        content:
          title: Text area input
          type: string
          description: Add your new entity
          ui:widget: textarea
          ui:options:
            rows: 10
          ui:help: 'Make sure it is valid by checking the schema at `/tools/entity-preview`'
          ui:placeholder: |
            ---
            apiVersion: backstage.io/v1alpha1
              kind: Component
              metadata:
                name: backstage
              spec:
                type: library
                owner: CNCF
                lifecycle: experimental
  steps:
    - id: appendFile
      name: Append To File
      action: roadiehq:utils:fs:append
      input:
        path: ${{ parameters.path }}
        content: ${{ parameters.content }}
```

### Write to File

**Action name:** `roadiehq:utils:fs:write`

This action writes a string to a temporary file in the Scaffolder workspace.

**Required params:**

- path: The file path for the content you want to write.
- content: The content you want to write.

```yaml
---
parameters:
  path:
    title: Path
    type: string
    description: The path to the desired new file
  content:
    title: Content
    type: string
    description: The content of the newly created file
steps:
  - id: writeFile
    name: Create File
    action: roadiehq:utils:fs:write
    input:
      path: ${{ parameters.path }}
      content: ${{ parameters.content }}
```

#### Example template

```yaml
---
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: overwrite-file-template-example
  title: Write content to a file
  description: Write a file with the given content.
spec:
  owner: roadie
  type: service

  parameters:
    - title: PR Data
      properties:
        repository:
          title: Repository name
          type: string
          description: The name of the repository
        org:
          title: Repository Organisation
          type: string
          description: The Github org that the repository is in
        pr_branch:
          title: PR Branch
          type: string
          description: The new branch to make a pr from
    - title: Append content
      properties:
        path:
          title: Path
          type: string
          description: The path to the file you want to append this content to in the scaffolder workspace
        content:
          title: Text area input
          type: string
          description: Add your new entity
          ui:widget: textarea
          ui:options:
            rows: 10
          ui:help: 'Make sure it is valid by checking the schema at `/tools/entity-preview`'
          ui:placeholder: |
            ---
            apiVersion: backstage.io/v1alpha1
              kind: Component
              metadata:
                name: backstage
              spec:
                type: library
                owner: CNCF
                lifecycle: experimental

  steps:
    - id: fetch-repo
      name: Fetch repo
      action: fetch:plain
      input:
        url: https://github.com/${{ parameters.org }}/${{ parameters.repository }}
    - id: write-to-file
      name: Overwrite File Or Create New
      action: roadiehq:utils:fs:write
      input:
        path: ${{ parameters.path }}
        content: ${{ parameters.content }}
    - id: publish-pr
      name: Publish PR
      action: publish:github:pull-request
      input:
        repoUrl: github.com?repo=${{ parameters.repository }}&owner=${{ parameters.org }}
        branchName: ${{ parameters.pr_branch }}
        title: Write content to ${{ parameters.path }}
        description: This PR was created by a Backstage scaffolder task
    - id: log-message
      name: Log PR URL
      action: debug:log
      input:
        message: 'RemoteURL: ${{ steps["publish-pr"].output.remoteUrl }}'
```