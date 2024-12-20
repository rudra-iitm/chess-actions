# Chess Actions - Play Chess in GitHub Issues

Chess Actions is a GitHub Action that brings the game of chess directly into your GitHub issues tab. Players can create games, make moves, offer/accept withdrawals, and resign all through issue comments. The workflow updates the chessboard dynamically and manages the game state seamlessly within the repository.

---

## **How to Use**

### Step 1: Add the Workflow File
Create a file named `chess-actions.yml` in your repository under `.github/workflows/` and paste the following code:

```yaml
name: Play Chess Workflow

on:
  issues:
    types:
      - opened
      - closed
  issue_comment:
    types:
      - created

jobs:
  play-chess:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      contents: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Use Play Chess Action
        uses: rudra-iitm/chess-actions@main
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

### Step 2: Create a New Game
- Open a new issue in your repository with the title: `Chess: Create New Game`.
- The workflow will automatically:
  - Generate a chessboard.
  - Assign White to the issue creator.
  - Assign Black to the first player who makes a move.
  - Add relevant labels and manage assignments.

### Step 3: Play the Game
Players can make moves using comments on the issue. Use the following commands:
- **Make a Move:**
  - `Chess: Move {src} to {dest}`  
    Example: `Chess: Move e2 to e4`
- **Offer Withdraw:**
  - `Chess: Offer Withdraw`
- **Accept Withdraw:**
  - `Chess: Accept Withdraw`
- **Resign:**
  - `Chess: Resign`

The workflow will:
- Validate moves.
- Update the chessboard dynamically in the issue description.
- Close the issue automatically upon a win, draw, or resignation.

### Step 4: Game Rules and Constraints
- No player can participate in more than **5 ongoing games** (excluding the repository owner).
- All game states are stored in the repository for persistence.
- Labels will be updated automatically to reflect the game status (e.g., Win, Draw).

---

## **Features**
- Seamless integration into GitHub issues.
- Automatic chessboard generation and updates.
- Dynamic role assignment and label management.
- Persistence of game states within the repository.
- Automatic closure of issues upon game completion.

---

## **Contributing**
Feel free to fork the repository, submit issues, or create pull requests for improvements. Collaboration is welcome!

---

Happy coding and happy playing! ♟️