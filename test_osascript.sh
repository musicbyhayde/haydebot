#!/bin/bash
run_in_new_terminal() {
    local cmd=$1
    local title=$2
    osascript <<APPLESCRIPT
    tell application "Terminal"
        do script "cd \"$(pwd)\" && echo -n '\033]0;$title\007' && $cmd"
    end tell
APPLESCRIPT
}

run_in_new_terminal "echo hello" "Test-Title"
