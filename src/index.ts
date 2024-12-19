import { Octokit } from "@octokit/rest";
import { config } from "dotenv";
import { main } from "./main.js";

config();

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

(async () => {
    try {
        const [owner, repo] = (process.env.GITHUB_REPOSITORY?.split('/') || []);
        console.log(`Fetching issue: ${owner}/${repo}/#${process.env.ISSUE_NUMBER}`);
        const { data: issue } = await octokit.rest.issues.get({
            owner,
            repo,
            issue_number: process.env.ISSUE_NUMBER ? parseInt(process.env.ISSUE_NUMBER) : 0,
        });

        await main(octokit, issue);
    } catch (error) {
        console.error('Error fetching issue or processing:', error);
    }
})();
