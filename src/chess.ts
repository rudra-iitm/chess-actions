import { Octokit } from '@octokit/rest';
import { Chess, Square } from 'chess.js';
import { createVisualFen, parseGitHubUrl, saveGameState } from './utils.js';

export const uploadBoardAsset = async (
    octokit: Octokit,
    owner: string,
    repo: string,
    commentId: Number,
    buffer: Buffer
): Promise<string> => {
    const { data: releases } = await octokit.rest.repos.listReleases({
        owner,
        repo,
    });

    let release = releases.find(r => r.name === 'Chess Board Image Upload');
    if (!release) {
        const releaseResponse = await octokit.rest.repos.createRelease({
            owner,
            repo,
            tag_name: `v${Date.now()}`,
            name: 'Chess Board Image Upload',
            body: 'Uploading the current chessboard state.',
        });
        release = releaseResponse.data;
    }

    const { data: uploadedAsset } = await octokit.rest.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: release.id,
        name: `${commentId}-board.png`,
        // @ts-ignore
        data: buffer,
        headers: {
            'Content-Type': 'application/octet-stream',
        },
    });

    return uploadedAsset.browser_download_url;
};

export const handleMoveAction = async (octokit: Octokit, commentId: Number, move: { from: Square; to: Square; promotion?: string }, issue: any, {comments}: any, gameState: any) => {
    const chess = new Chess(gameState.previousFen);
    try {
        chess.load(gameState.previousFen);
    } catch {
        const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);

        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: comments.invalid_fen.replace('{previousFen}', gameState.previousFen || 'unknown'),
        });
        return;
    }
    try {
        chess.move({ from: move.from, to: move.to, promotion: move.promotion as any });
        console.log('Moving Piece:', move);
    } catch (error) {
        const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
        const invalid_move_comment = comments.invalid_move[Math.floor(Math.random() * comments.invalid_move.length)];
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: invalid_move_comment.replace('{src}', move.from.toUpperCase()).replace('{dest}', move.to.toUpperCase()),
        });
        return;
    }

    if (chess.isCheckmate() || chess.isDraw()) {
        const resultMessage = chess.isCheckmate()
            ? comments.checkmate.replace('{winner}', chess.turn() === 'w' ? 'Black' : 'White')
            : comments.draw;

        const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
        await octokit.rest.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            body: resultMessage,
        });

        saveGameState(issue.number, { previousFen: chess.fen(), processedComments: gameState.processedComments });
        return chess.fen();
    }

    const currentFen = chess.fen();
    const nextTurn = chess.turn() === 'w' ? 'White' : 'Black';
    const imageUri = await createVisualFen(issue, currentFen, commentId);

    const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
    const next_move_comment = comments.next_move[Math.floor(Math.random() * comments.next_move.length)];
    await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        body: next_move_comment
            .replace('{src}', move.from.toUpperCase())
            .replace('{dest}', move.to.toUpperCase())
            .replace('{nextTurn}', nextTurn) +
            `\n\nCurrent board state:\n\n![Chess Board](${imageUri})`,
    });

    const successful_move_comment = comments.successful_move[Math.floor(Math.random() * comments.successful_move.length)];
    await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: successful_move_comment
            .replace('{src}', move.from.toUpperCase())
            .replace('{dest}', move.to.toUpperCase())
            .replace('{nextTurn}', nextTurn)
    });

    saveGameState(issue.number, { previousFen: currentFen, processedComments: gameState.processedComments });
    return chess.fen();
};

export const handleNewGameAction = async (octokit: Octokit, issue: any, {comments}: any) => {
    console.log('Creating new game for issue:', issue.number);
    const chess = new Chess();
    const initialFen = chess.fen();
    const imageUri = await createVisualFen(issue, initialFen, 'init');

    const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
    const new_game_comment = comments.new_game[Math.floor(Math.random() * comments.new_game.length)];
    await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        body: new_game_comment + `\n\nInitial board state:\n\n![Chess Board](${imageUri})`,
    });


    const successful_new_game_comment = comments.successful_new_game[Math.floor(Math.random() * comments.successful_new_game.length)];
    await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: successful_new_game_comment,
    });

    saveGameState(issue.number, { previousFen: initialFen, processedComments: [] });
};
