{
  "$comment": [
    "ไฟล์นี้จะถูกคัดลอกไปเป็น .claude/settings.json ตอน Phase 7 (commit เข้า repo ให้ทั้งทีมได้เหมือนกัน)",
    "ของส่วนตัวที่ไม่อยากแชร์ให้ใส่ .claude/settings.local.json แทน (gitignore ไว้)",
    "ปรับ path ใน permissions ให้ตรงกับ stack จริงที่เลือกใน Phase 2 ก่อนใช้",
    "อย่านั่งเดา allowlist — หลังใช้งานไป 1-2 สัปดาห์ให้รัน skill fewer-permission-prompts มันสแกน transcript แล้วเสนอรายการให้",
    "deny ของ git merge/rebase ทำงานคู่กับ hooks/guard-bash.js — main รับของผ่าน PR + gate เท่านั้น",
    "deny การเขียน docs/backlog/board.md เพราะไฟล์นั้น generate จาก board.js — แก้ที่ tasks/*.md แทน"
  ],

  "permissions": {
    "allow": [
      "Bash(pnpm verify)",
      "Bash(pnpm typecheck)",
      "Bash(pnpm lint)",
      "Bash(pnpm test)",
      "Bash(pnpm test:cov)",
      "Bash(pnpm build)",
      "Bash(pnpm exec *)",
      "Bash(node .claude/check-config.js*)",
      "Bash(node .claude/docs-lint.js*)",
      "Bash(node .claude/board.js*)",
      "Bash(node .claude/gate.js*)",
      "Bash(gh pr *)",
      "Bash(glab mr *)",
      "Bash(git status *)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git add *)",
      "Bash(git branch *)",
      "Bash(git switch *)",
      "Bash(git stash *)",
      "Read(docs/**)",
      "Read(src/**)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./**/.env)",
      "Read(./**/.env.*)",
      "Read(./**/*.pem)",
      "Read(./**/*.key)",
      "Read(~/.ssh/**)",
      "Read(~/.aws/**)",
      "Bash(rm -rf *)",
      "Bash(git push --force *)",
      "Bash(git reset --hard *)",
      "Bash(git merge *)",
      "Bash(git rebase *)",
      "Write(docs/backlog/board.md)",
      "Edit(docs/backlog/board.md)"
    ]
  },

  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session-context.js\"",
            "timeout": 10
          }
        ]
      }
    ],

    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-edit.js\"",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-bash.js\"",
            "timeout": 10
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-new-component.js\"",
            "timeout": 10
          }
        ]
      }
    ],

    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/format-changed.js\"",
            "timeout": 60,
            "statusMessage": "format + lint ไฟล์ที่แก้..."
          }
        ]
      }
    ]
  }
}
