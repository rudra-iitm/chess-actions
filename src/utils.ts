import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Chess, Square } from 'chess.js';
import { createCanvas } from 'canvas';
import { Octokit } from '@octokit/rest';

export enum Actions {
    Move = 'move',
    Invalid = 'invalid',
}

export interface GameState {
    previousFen: string,
    mainThread: number,
    processedComments: number[],
    moves: { from: Square, to: Square, playedBy: string, promotion?: string  }[],
    players: { white: string, black: string },
}

const CONFIG_FILE = 'configs/settings.yml';

export const loadGlobalData = (): { activeGames: Record<string, string[]> } => {
    const dir = path.join(process.cwd(), 'data');

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const globalDataFile = path.join(dir, 'global-state.yml');

    if (fs.existsSync(globalDataFile)) {
        return yaml.load(fs.readFileSync(globalDataFile, 'utf8')) as any;
    }

    return { activeGames: {} };
};

export const saveGlobalData = (data: any) => {
    const dir = path.join(process.cwd(), 'data');
    const globalData = path.join(dir, 'global-state.yml');
    fs.writeFileSync(globalData, yaml.dump(data));

};

export const getIssueDirectory = (issueNumber: number): string => {
    const dir = path.join(process.cwd(), 'data', `issue-${issueNumber}`);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
};

export const loadCommentsConfig = (): { [key: string]: string } => {
    return yaml.load(fs.readFileSync(CONFIG_FILE, 'utf8')) as any;
};

export const loadGameState = (issueNumber: number): GameState => {
    const stateFile = path.join(getIssueDirectory(issueNumber), 'game-state.yml');
    if (fs.existsSync(stateFile)) {
        return yaml.load(fs.readFileSync(stateFile, 'utf8')) as any;
    }
    return { previousFen: '', mainThread: -1, processedComments: [], moves: [], players: { white: 'NotAssigned', black: 'NotAssigned' } };
};

export const saveGameState = (issueNumber: number, state: GameState) => {
    const stateFile = path.join(getIssueDirectory(issueNumber), 'game-state.yml');
    fs.writeFileSync(stateFile, yaml.dump(state));
};

export const parseComment = (comment: any): { action: Actions; move?: { from: Square; to: Square; promotion?: string } } => {
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

export const parseGitHubUrl = (url: string) => {
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

export const createVisualFen = async (
    issue: any,
    fen: string,
    commentId: Number | String,
): Promise<string> => {
    const canvas = createCanvas(450, 450);
    const ctx = canvas.getContext('2d');
    const chess = new Chess(fen);

    const squareSize = 50;
    const offset = 25;
    const boardSize = 8 * squareSize;

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
        ctx.fillText(`${labelRow}`, offset + boardSize + 12, offset + i * squareSize + squareSize / 2);

        ctx.fillText(`${String.fromCharCode(labelCol)}`, offset + i * squareSize + squareSize / 2, 12);
        ctx.fillText(`${String.fromCharCode(labelCol)}`, offset + i * squareSize + squareSize / 2, offset + boardSize + 12);
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

    const board_dir = path.join(getIssueDirectory(issue.number), 'boards');

    if (!fs.existsSync(board_dir)) {
        fs.mkdirSync(board_dir, { recursive: true });
    }

    const imagePath = path.join(board_dir, `${commentId}-board.png`);

    fs.writeFileSync(imagePath, canvas.toBuffer('image/png'));

    console.log('Uploading board image to GitHub');

    const { owner, repo } = parseGitHubUrl(issue.url);

    const uri = `https://raw.githubusercontent.com/${owner}/${repo}/main/data/issue-${issue.number}/boards/${commentId}-board.png`

    return uri;
};

export const addLabel = async (octokit: Octokit, issue: any, label: { name: string, color?: string, description?: string }) => {
    try {
      const { owner, repo, issueNumber } = parseGitHubUrl(issue.url);
  
      const existingLabels = await octokit.rest.issues.listLabelsForRepo({
        owner,
        repo,
      });
  
      const labelExists = existingLabels.data.some(existingLabel => existingLabel.name === label.name);
  
      if (!labelExists) {
        await octokit.issues.createLabel({
          owner,
          repo,
          name: label.name,
          color: label.color,
          description: label.description
        });
      }
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels: [label.name]
      });
    } catch (error) {
      console.error('Error creating label:', error);
    }
  };

export const removeLabel = async (octokit: Octokit, issue: any, label: string) => {
    try {
        const { owner, repo } = parseGitHubUrl(issue.url);

        await octokit.issues.deleteLabel({
            owner,
            repo,
            name: label,
        });
    } catch (error) {
        console.error('Error removing label:', error);
    }
}

export const handleIssueClosed = (octokit: Octokit, issue: any) => {
    const { activeGames } = loadGlobalData();
    const { issueNumber } = parseGitHubUrl(issue.url);

    console.log(activeGames);

    if (!activeGames || typeof activeGames !== 'object') {
        console.error("Global data is missing or 'activeGames' is invalid.");
        return;
    }

    for (const player in activeGames) {
        const games = activeGames[player];
            const gameIndex = games.indexOf(issueNumber.toString());
            if (gameIndex !== -1) {
                games.splice(gameIndex, 1);
                console.log(`Removed issue #${issueNumber} from active games of player ${player}`);
            activeGames[player] = games;
        } else {
            console.warn(`activeGames[${player}] is not an array, skipping.`);
        }
    }

    console.log('After Handling', activeGames);

    saveGlobalData({ activeGames });
};
