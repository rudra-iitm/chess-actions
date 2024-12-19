import { Octokit } from '@octokit/rest';
import { Chess, Square } from 'chess.js';
import { createVisualFen, parseGitHubUrl, saveGameState, GameState, addLabel, removeLabel  } from './utils.js';

export const handleMoveAction = async (octokit: Octokit, comment: any, move: { from: Square; to: Square; promotion?: string }, issue: any, {comments}: any, gameState: GameState) => {
    const chess = new Chess(gameState.previousFen);
    
    if (gameState.players.black === 'NotAssigned' && comment.user?.login !== gameState.players.white) {
        gameState.players.black = comment.user?.login || 'black_player';

        addLabel(octokit, issue, { name: `Black-@${gameState.players.black}`, color: '484848', description: 'Black Player' });

        const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
        await octokit.rest.issues.addAssignees({
            owner,
            repo,
            issue_number: issueNumber,
            assignees: [comment.user?.login],
        });
    }

    if ((chess.turn() === 'w' && comment.user?.login !== gameState.players.white) || (chess.turn() === 'b' && comment.user?.login !== gameState.players.black)) {
        const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
        await octokit.rest.issues.deleteComment({
            owner,
            repo,
            issue_number: issueNumber,
            comment_id: comment.id,
        });

        const invalid_turn_comment = comments.invalid_turn[Math.floor(Math.random() * comments.invalid_turn.length)];
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: invalid_turn_comment.replace('{author}', comment.user?.login).replace('{nextTurn}', chess.turn() === 'w' ? `White (@${gameState.players.white})` : `Black (@${gameState.players.black})`),
        });
        return gameState;
    }

    const commentId = comment.id;

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
        return gameState;
    }
    try {
        chess.move({ from: move.from, to: move.to, promotion: move.promotion as any });
        console.log('Moving Piece:', move);
    } catch (error) {
        const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
        await octokit.rest.issues.deleteComment({
            owner,
            repo,
            issue_number: issueNumber,
            comment_id: commentId,
        });

        const invalid_move_comment = comments.invalid_move[Math.floor(Math.random() * comments.invalid_move.length)];
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: invalid_move_comment.replace('{src}', move.from.toUpperCase()).replace('{dest}', move.to.toUpperCase()),
        });
        return gameState;
    }

    const currentFen = chess.fen();
    const nextTurn = chess.turn() === 'w' ? `White (@${gameState.players.white})` : `Black (@${gameState.players.black})`;
    const imageUri = await createVisualFen(issue, currentFen, commentId);

    if (chess.isCheckmate() || chess.isDraw()) {
        const resultMessage = chess.isCheckmate()
            ? comments.checkmate.replace('{winner}', chess.turn() === 'w' ? `Black (${gameState.players.black})` : `White (${gameState.players.white})`)
            : comments.draw;

        const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
        await octokit.rest.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            body: resultMessage + `\n\nFinal board state:\n\n![Chess Board](${imageUri})`,
            state: 'closed',
        });

        if (chess.isCheckmate()) {
            const winner = chess.turn() === 'w' ? gameState.players.black : gameState.players.white;
            addLabel(octokit, issue, { name: `👑-@${winner}`, color: '6ba8a9', description: 'Checkmate' });
        } else {
            addLabel(octokit, issue, { name: '½–½ draw', color: 'eb4d55', description: 'Draw' });
        }

        await removeLabel(octokit, issue, 'White-@' + gameState.players.white);
        await removeLabel(octokit, issue, 'Black-@' + gameState.players.black);

        gameState.previousFen = currentFen;
        gameState.moves.push({ from: move.from, to: move.to, playedBy: comment.user?.login });
        return gameState;
    }

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
    gameState.previousFen = currentFen;
    gameState.moves.push({ from: move.from, to: move.to, playedBy: comment.user?.login, promotion: move.promotion });

    const successful_move_comment = comments.successful_moves[Math.floor(Math.random() * comments.successful_moves.length)];

    const previousMoves = gameState.moves
    .map(m => `- ${m.playedBy == gameState.players.white ? '**White**' : '**Black**'} (@${m.playedBy}): ${m.from.toUpperCase()} → ${m.to.toUpperCase()}`)
    .join('\n');

    const body = `
### Previous Moves
${previousMoves || "_No moves have been made yet._"}

${successful_move_comment
            .replace('{src}', move.from.toUpperCase())
            .replace('{dest}', move.to.toUpperCase())
            .replace('{nextTurn}', nextTurn)}
        `;

    await octokit.rest.issues.updateComment({
        owner,
        repo,
        issue_number: issueNumber,
        comment_id: gameState.mainThread,
        body,
    });

    await octokit.rest.issues.deleteComment({
        owner,
        repo,
        issue_number: issueNumber,
        comment_id: commentId,
    });

    return gameState;
};

export const handleNewGameAction = async (octokit: Octokit, issue: any, { comments }: any) => {
    console.log('Creating new game for issue:', issue.number);
    
    const chess = new Chess();
    const initialFen = chess.fen();
    const imageUri = await createVisualFen(issue, initialFen, 'init');

    const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);

    const new_game_comment = comments.new_game?.[Math.floor(Math.random() * comments.new_game.length)] || "Starting a new game!";
    await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        body: `${new_game_comment}\n\nInitial board state:\n\n![Chess Board](${imageUri})`,
    });

    const successful_new_game_comment = comments.successful_new_game?.[Math.floor(Math.random() * comments.successful_new_game.length)] || "Game initialized successfully!";
    const { data: { id: commentId } } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: issueNumber,
        body: successful_new_game_comment.replace('{author}', issue.user?.login),
    });

    await octokit.rest.issues.addAssignees({
        owner,
        repo,
        issue_number: issueNumber,
        assignees: [issue.user?.login],
    });

    addLabel(octokit, issue, { name: 'chess-game', color: '4d80e4', description: 'Chess Game Issue' });

    const gameState = {
        previousFen: initialFen,
        mainThread: commentId,
        processedComments: [],
        moves: [],
        players: { white: issue.user?.login || 'white_player', black: 'NotAssigned' },
    };

    addLabel(octokit, issue, { name: `White-@${gameState.players.white}`, color: 'f0f0f0', description: 'White PLayer' });

    saveGameState(issueNumber, gameState);

    return gameState;
};
