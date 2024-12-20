import { Octokit } from '@octokit/rest';
import { Actions, loadCommentsConfig, loadGameState, parseComment, parseGitHubUrl, saveGameState } from './utils.js';
import { handleAcceptDrawAction, handleMoveAction, handleNewGameAction, handleOfferDrawAction, handleResignAction } from './chess.js';

const processComments = async (octokit: Octokit, issue: any) => {
    const commentsConfig = loadCommentsConfig();
    let gameState = loadGameState(issue.number);

    const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
    const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
    });

    for (const comment of comments) {
        if (gameState.processedComments.includes(comment.id)) continue;

        console.log('Processing comment:', comment.id);

        const { action, move } = parseComment(comment);
        if (action === Actions.Move && move) {
            gameState = await handleMoveAction(octokit, comment, move, issue, commentsConfig, gameState) || gameState.previousFen;
        } else if (action === Actions.OfferDraw) {
            gameState == await handleOfferDrawAction(octokit, comment, issue, gameState) || gameState.previousFen;
        } else if (action === Actions.AcceptDraw) {
            gameState == await handleAcceptDrawAction(octokit, comment, issue, gameState) || gameState.previousFen;
        } else if (action === Actions.Resign) {
            gameState == await handleResignAction(octokit, comment, issue, gameState) || gameState.previousFen;
        }

        gameState.processedComments.push(comment.id);
    }

    saveGameState(issue.number, gameState);
    return gameState.previousFen;
};

const main = async (octokit: Octokit, issue: any) => {
    if (issue.title === 'Chess: Create New Game') {
        const { previousFen } = loadGameState(issue.number);
        if (previousFen === '') {
            await handleNewGameAction(octokit, issue, loadCommentsConfig());
        } else {
            await processComments(octokit, issue);
        }
    }
};

export { main };
