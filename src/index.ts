import { Octokit } from "@octokit/rest";
import { config } from "dotenv";
import { main } from "./main.js";

config();

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

(async () => {
    try {
        const { data: issue } = await octokit.rest.issues.get({
            owner: process.env.GITHUB_REPOSITORY_OWNER || '',
            repo: process.env.GITHUB_REPOSITORY || '',
            issue_number: process.env.GITHUB_ISSUE_NUMBER ? parseInt(process.env.GITHUB_ISSUE_NUMBER) : 0,
        });

        await main(octokit, issue);
    } catch (error) {
        console.error('Error fetching issue or processing:', error);
    }
})();
