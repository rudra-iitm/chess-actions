import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Chess, Square } from 'chess.js';
import { Octokit } from '@octokit/rest';
import { createCanvas } from 'canvas';

enum Actions {
    Move = 'move',
    Invalid = 'invalid',
}

const CONFIG_FILE = 'configs/settings.yml';

const getIssueDirectory = (issueNumber: number): string => {
    const dir = path.join(process.cwd(), 'data', `issue-${issueNumber}`);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
};

const loadCommentsConfig = (): { [key: string]: string } => {
    return yaml.load(fs.readFileSync(CONFIG_FILE, 'utf8')) as any;
};

const loadGameState = (issueNumber: number): { previousFen: string; processedComments: number[] } => {
    const stateFile = path.join(getIssueDirectory(issueNumber), 'game-state.yml');
    if (fs.existsSync(stateFile)) {
        return yaml.load(fs.readFileSync(stateFile, 'utf8')) as any;
    }
    return { previousFen: '', processedComments: [] };
};

const saveGameState = (issueNumber: number, state: { previousFen: string; processedComments: number[] }) => {
    const stateFile = path.join(getIssueDirectory(issueNumber), 'game-state.yml');
    fs.writeFileSync(stateFile, yaml.dump(state));
};

const parseComment = (comment: any): { action: Actions; move?: { from: Square; to: Square; promotion?: string } } => {
    const { body } = comment;

    if (body.toLowerCase().startsWith('chess: move')) {
        const regex = /Chess: Move ([A-H][1-8]) to ([A-H][1-8])(?: promote to ([qrbn]))?/i;
        const matchObj = regex.exec(body);

        if (matchObj) {
            const from = matchObj[1].toLowerCase() as Square;
            const to = matchObj[2].toLowerCase() as Square;
            const promotion = matchObj[3]?.toLowerCase();
            return { action: Actions.Move, move: { from, to, promotion } };
        }
    }

    return { action: Actions.Invalid };
};

function parseGitHubUrl(url: string) {
    const regex = /https:\/\/api\.github\.com\/repos\/([^\/]+)\/([^\/]+)\/issues\/(\d+)/;
    const match = url.match(regex);

    if (match) {
        const owner = match[1];
        const repo = match[2];
        const issueNumber = parseInt(match[3], 10);

        return { owner, repo, issueNumber };
    } else {
        throw new Error('Invalid GitHub URL format');
    }
}

const uploadBoardAsset = async (
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

const createVisualFen = async (
    octokit: Octokit,
    issue: any,
    fen: string,
    commentId: Number
): Promise<string> => {
    const canvas = createCanvas(450, 450);
    const ctx = canvas.getContext('2d');
    const chess = new Chess(fen);

    const squareSize = 50;
    const offset = 25;

    const isBlackTurn = fen.split(' ')[1] === 'b';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const adjustedRow = isBlackTurn ? 7 - row : row;
            const adjustedCol = isBlackTurn ? 7 - col : col;

            ctx.fillStyle = (adjustedRow + adjustedCol) % 2 === 0 ? '#f0d9b5' : '#b58863';
            ctx.fillRect(offset + adjustedCol * squareSize, offset + adjustedRow * squareSize, squareSize, squareSize);
        }
    }

    ctx.font = '20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'black';

    for (let i = 0; i < 8; i++) {
        const labelRow = isBlackTurn ? i + 1 : 8 - i;
        const labelCol = isBlackTurn ? 104 - i : 97 + i;

        ctx.fillText(`${labelRow}`, 12, offset + i * squareSize + squareSize / 2);
        ctx.fillText(`${labelRow}`, offset + 8 * squareSize + 12, offset + i * squareSize + squareSize / 2);

        ctx.fillText(`${String.fromCharCode(labelCol)}`, offset + i * squareSize + squareSize / 2, 12);
        ctx.fillText(`${String.fromCharCode(labelCol)}`, offset + i * squareSize + squareSize / 2, offset + 8 * squareSize + 12);
    }

    const pieces: { [key: string]: string } = {
        'p': '♟', 'n': '♞', 'b': '♝', 'r': '♜', 'q': '♛', 'k': '♚',
        'P': '♙', 'N': '♘', 'B': '♗', 'R': '♖', 'Q': '♕', 'K': '♔'
    };

    ctx.font = '40px Arial';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const adjustedRow = isBlackTurn ? 7 - row : row;
            const adjustedCol = isBlackTurn ? 7 - col : col;

            const square = `${String.fromCharCode(97 + col)}${8 - row}` as Square;
            const piece = chess.get(square);
            if (piece) {
                ctx.fillStyle = piece.color === 'w' ? 'white' : 'black';
                ctx.fillText(
                    pieces[piece.type.toUpperCase()],
                    offset + adjustedCol * squareSize + squareSize / 2,
                    offset + adjustedRow * squareSize + squareSize / 2
                );
            }
        }
    }

    const imagePath = path.join(getIssueDirectory(issue.number), `${commentId}-board.png`);
    fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));

    const { owner, repo } = parseGitHubUrl(issue.url);

    const uri = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/issue-${issue.number}/${commentId}-board.png`

    return uri;
};

const handleMoveAction = async (octokit: Octokit, commentId: Number, move: { from: Square; to: Square; promotion?: string }, issue: any, {comments}: any, gameState: any) => {
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
    } catch (error) {
        const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: comments.invalid_move.replace('{src}', move.from.toUpperCase()).replace('{dest}', move.to.toUpperCase()),
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
        const updatedState = loadGameState(issue.number);
        console.log("Updated GameState:", updatedState);
        return;
    }

    const currentFen = chess.fen();
    const nextTurn = chess.turn() === 'w' ? 'White' : 'Black';
    const imageUri = await createVisualFen(octokit, issue, currentFen, commentId);

    const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
    await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        body: comments.successful_move
            .replace('{src}', move.from.toUpperCase())
            .replace('{dest}', move.to.toUpperCase())
            .replace('{nextTurn}', nextTurn) +
            `\n\nCurrent board state:\n\n![Chess Board](${imageUri})`,
    });

    saveGameState(issue.number, { previousFen: currentFen, processedComments: gameState.processedComments });
    const updatedState = loadGameState(issue.number);
    console.log("Updated GameState:", updatedState);
};

const handleNewGameAction = async (octokit: Octokit, issue: any, {comments}: any) => {
    const { previousFen } = loadGameState(issue.number);
    if (previousFen != '') {
        return;
    }
    console.log('Creating new game for issue:', issue.number);
    const chess = new Chess();
    const initialFen = chess.fen();
    const imageUri = await createVisualFen(octokit, issue, initialFen, issue.number);

    const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
    await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        body: comments.new_game + `\n\nInitial board state:\n\n![Chess Board](${imageUri})`,
    });

    saveGameState(issue.number, { previousFen: initialFen, processedComments: [] });
};

const processComments = async (octokit: Octokit, issue: any) => {
    const commentsConfig = loadCommentsConfig();
    const gameState = loadGameState(issue.number);

    const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
    const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
    });

    for (const comment of comments) {
        if (gameState.processedComments.includes(comment.id)) continue;

        const { action, move } = parseComment(comment);
        if (action === Actions.Move && move) {
            await handleMoveAction(octokit, comment.id, move, issue, commentsConfig, gameState);
        }

        gameState.processedComments.push(comment.id);
    }

    saveGameState(issue.number, gameState);
};

const main = async (octokit: Octokit, issue: any) => {
    if (issue.title === 'Chess: Create New Game') {
        await handleNewGameAction(octokit, issue, loadCommentsConfig());
        await processComments(octokit, issue);
    }
};

export { main };
