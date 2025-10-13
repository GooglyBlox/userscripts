import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const CONFIG = {
  userId: process.env.GF_USER_ID || "1289637",
  namespace: "https://github.com/GooglyBlox",
  author: "GooglyBlox",
  baseDir: process.cwd(),
  scriptsDir: path.join(process.cwd(), "scripts"),
};

class GreasyforkSync {
  constructor() {
    this.hasChanges = false;
  }

  async fetchJson(url) {
    const response = await fetch(url, {
      headers: { "User-Agent": "greasyfork-sync/1.0" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }
    return response.json();
  }

  async fetchText(url) {
    const response = await fetch(url, {
      headers: { "User-Agent": "greasyfork-sync/1.0" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }
    return response.text();
  }

  async getUserScripts() {
    const userData = await this.fetchJson(
      `https://greasyfork.org/users/${CONFIG.userId}.json`
    );
    return userData.scripts || [];
  }

  async getScriptDetails(scriptId) {
    const scriptData = await this.fetchJson(
      `https://greasyfork.org/scripts/${scriptId}.json`
    );
    return scriptData;
  }

  extractCategory(script) {
    const matches = script.code_url.toLowerCase();
    const name = script.name.toLowerCase();

    if (matches.includes("github") || name.includes("github")) return "GitHub";
    if (matches.includes("instagram") || name.includes("instagram"))
      return "Instagram";
    if (matches.includes("comick") || name.includes("comick")) return "Comick";
    if (matches.includes("roblox") || name.includes("roblox")) return "Roblox";
    if (matches.includes("zybooks") || name.includes("zybooks")) return "zyBooks";
    return "Misc";
  }

  slugify(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  generateReadme(script, category) {
    return `# ${script.name}

**Author:** ${CONFIG.author}
**Category:** ${category}
**Version:** ${script.version}
**Greasyfork ID:** ${script.id}

## Description
${script.description || "No description provided."}

## Links
- [Greasyfork Page](https://greasyfork.org/scripts/${script.id})
- [Install Script](${script.code_url})

## Version History
Last updated: ${new Date(script.created_at).toLocaleDateString()}

---
*This script is automatically synced from Greasyfork*
`;
  }

  async writeFileIfChanged(filePath, content) {
    try {
      const existing = await fs.readFile(filePath, "utf8");
      const existingHash = crypto
        .createHash("sha256")
        .update(existing)
        .digest("hex");
      const newHash = crypto.createHash("sha256").update(content).digest("hex");

      if (existingHash === newHash) {
        return false;
      }
    } catch (error) {
      // File doesn't exist, will be created
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
    return true;
  }

  async syncScript(script) {
    const category = this.extractCategory(script);
    const slug = this.slugify(script.name);
    const scriptDir = path.join(CONFIG.scriptsDir, category, slug);

    const userJsPath = path.join(scriptDir, `${slug}.user.js`);
    const readmePath = path.join(scriptDir, "README.md");

    const scriptContent = await this.fetchText(script.code_url);
    const readmeContent = this.generateReadme(script, category);

    const scriptChanged = await this.writeFileIfChanged(
      userJsPath,
      scriptContent
    );
    const readmeChanged = await this.writeFileIfChanged(
      readmePath,
      readmeContent
    );

    if (scriptChanged || readmeChanged) {
      console.log(`Updated: ${script.name} (${category})`);
      this.hasChanges = true;
    }

    return {
      id: script.id,
      name: script.name,
      version: script.version,
      category,
      slug,
    };
  }

  async generateMainReadme(syncedScripts) {
    if (!this.hasChanges) {
      console.log("No script changes detected, skipping README update");
      return;
    }

    const categories = {};

    syncedScripts.forEach((script) => {
      if (!categories[script.category]) {
        categories[script.category] = [];
      }
      categories[script.category].push(script);
    });

    let content = `# Greasyfork Scripts Mirror

This repository contains all userscripts published by **${
      CONFIG.author
    }** on Greasyfork.

**Total Scripts:** ${syncedScripts.length}
**Last Updated:** ${new Date().toLocaleString()}

## Categories

`;

    Object.keys(categories)
      .sort()
      .forEach((category) => {
        const scripts = categories[category].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        content += `\n### ${category} (${scripts.length})\n\n`;

        scripts.forEach((script) => {
          const relativePath = `./scripts/${category}/${script.slug}/${script.slug}.user.js`;
          content += `- [${script.name}](${relativePath}) - v${script.version} ([Greasyfork](https://greasyfork.org/scripts/${script.id}))\n`;
        });
      });

    content += `\n---\n*Auto-generated from Greasyfork API*\n`;

    const readmeChanged = await this.writeFileIfChanged(
      path.join(CONFIG.baseDir, "README.md"),
      content
    );

    if (readmeChanged) {
      console.log("Main README updated due to script changes");
    }
  }

  async run() {
    try {
      console.log("Fetching user scripts from Greasyfork...");
      const userScripts = await this.getUserScripts();
      console.log(`Found ${userScripts.length} scripts`);

      const syncedScripts = [];

      for (const script of userScripts) {
        try {
          const scriptDetails = await this.getScriptDetails(script.id);
          const syncResult = await this.syncScript(scriptDetails);
          syncedScripts.push(syncResult);
        } catch (error) {
          console.error(`Failed to sync script ${script.id}:`, error.message);
        }
      }

      await this.generateMainReadme(syncedScripts);

      console.log(`Sync complete. Changes detected: ${this.hasChanges}`);
    } catch (error) {
      console.error("Sync failed:", error);
      process.exit(1);
    }
  }
}

const sync = new GreasyforkSync();
await sync.run();
