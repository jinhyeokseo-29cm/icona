import dedent from "ts-dedent";

const GITHUB_API_VERSION = "2022-11-28";

export function createGithubClient(
  repoOwner: string,
  repoName: string,
  accessToken: string,
) {
  const ACCESS_TOKEN = accessToken;
  const API_URL = `https://api.github.com/repos/${repoOwner}/${repoName}`;

  async function uploadBlob(content: string): Promise<{ sha: string }> {
    return fetch(`${API_URL}/git/blobs`, {
      method: "POST",
      headers: {
        Authorization: `token ${ACCESS_TOKEN}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        content,
        encoding: "utf-8",
      }),
    }).then((res) => res.json());
  }

  async function getHead(branch: string): Promise<{ object: { sha: string } }> {
    return fetch(`${API_URL}/git/refs/heads/${branch}`, {
      headers: {},
    }).then((res) => res.json());
  }

  async function getContent(
    path: string,
  ): Promise<{ sha: string; content: string }> {
    return fetch(`${API_URL}/contents/${path}`, {
      method: "GET",
      headers: {
        Authorization: `token ${ACCESS_TOKEN}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    }).then((res) => res.json());
  }

  async function createBranch(name: string, sha: string) {
    return fetch(`${API_URL}/git/refs`, {
      method: "POST",
      headers: {
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        Authorization: `token ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        ref: `refs/heads/${name}`,
        sha,
      }),
    }).then((res) => res.json());
  }

  async function createTree(
    body: { path: string; mode: string; type: string; sha: string }[],
    baseTree: string,
  ): Promise<{ sha: string }> {
    return fetch(`${API_URL}/git/trees`, {
      method: "POST",
      headers: {
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        Authorization: `token ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        tree: body,
        base_tree: baseTree,
      }),
    }).then((res) => res.json());
  }

  async function createCommit(
    tree: string,
    message: string,
    parents: string[],
  ): Promise<{ sha: string }> {
    return fetch(`${API_URL}/git/commits`, {
      method: "POST",
      headers: {
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        Authorization: `token ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        tree: tree,
        message: message,
        parents: parents,
      }),
    }).then((res) => res.json());
  }

  async function updateRef(branch: string, commit: string) {
    return fetch(`${API_URL}/git/refs/heads/${branch}`, {
      method: "PATCH",
      headers: {
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        Authorization: `token ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        sha: commit,
      }),
    }).then((res) => res.json());
  }

  async function createPullRequest(
    head: string,
    base: string,
    title: string,
    body: string,
  ) {
    return fetch(`${API_URL}/pulls`, {
      method: "POST",
      headers: {
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        Authorization: `token ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        head: head,
        base: base,
        title: title,
        body: body,
      }),
    }).then((res) => res.json());
  }

  async function createSettingPR({
    iconFrameId,
    figmaFileKey,
  }: {
    iconFrameId: string;
    figmaFileKey: string;
  }) {
    const baseBranch = "main";
    const newBranch = `icona-setting-${new Date().getTime()}`;
    const commitTitle = "chore: add icona.yml";

    const files = [
      {
        path: ".icona/config.yml",
        content: dedent`
          # This file is generated by icona
          # Don't edit this file directly
          icon-frame-id: ${iconFrameId}
          figma-file-key: ${figmaFileKey}\n
        `,
      },
      {
        path: ".icona/release.md",
        content: dedent`
          # Release Note\n
        `,
      },
    ];

    const prTitle = "Setting up Icona";
    const prBody = "This PR is created by Icona.";

    const head = await getHead(baseBranch);

    const treeBody = await Promise.all(
      files.map((file) =>
        uploadBlob(file.content).then((blob) => ({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        })),
      ),
    );

    const tree = await createTree(treeBody, head.object.sha);
    const commit = await createCommit(tree.sha, commitTitle, [head.object.sha]);

    await createBranch(newBranch, head.object.sha);
    await updateRef(newBranch, commit.sha);
    await createPullRequest(newBranch, baseBranch, prTitle, prBody);
  }

  async function createDeployPR() {
    const baseBranch = "main";
    const newBranch = `icona-deploy-${new Date().getTime()}`;
    const prTitle = "Update Icona";
    const filePath = ".icona/release.md";
    const commitTitle = "chore: update release.md";

    const head = await getHead(baseBranch);
    const release = await getContent(filePath);

    const files = [
      {
        path: ".icona/release.md",
        content: dedent`
        ${release.content}
  
        ## ${new Date().toISOString()}
        - Update Icons\n
      `,
      },
    ];

    const treeBody = await Promise.all(
      files.map((file) =>
        uploadBlob(file.content).then((blob) => ({
          path: file.path,
          mode: "100644",
          type: "blob",
          sha: blob.sha,
        })),
      ),
    );

    const tree = await createTree(treeBody, head.object.sha);
    const commit = await createCommit(tree.sha, commitTitle, [head.object.sha]);

    await createBranch(newBranch, head.object.sha);
    await updateRef(newBranch, commit.sha);
    await createPullRequest(newBranch, baseBranch, prTitle, "");
  }

  return { createSettingPR, createDeployPR };
}
