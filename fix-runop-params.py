#!/usr/bin/env python3
"""
Fix runOp() parameter order in archibald-bot.ts
Changes: runOp(name, category, async () => ..., category)
To: runOp(name, async () => ..., category)
"""

import re

file_path = "archibald-web-app/backend/src/archibald-bot.ts"

with open(file_path, 'r') as f:
    content = f.read()

# Pattern to match: runOp("name", "category", async () => { ... }, "category")
# We need to:
# 1. Find runOp calls with category as 2nd parameter
# 2. Remove the duplicate category at the end
# 3. Move the category after the function

# Step 1: Fix calls with pattern: runOp("name", "category", async () => ...), "category-duplicate")
# Replace with: runOp("name", async () => ...), "category")

pattern = r'(await\s+this\.runOp\([^,]+),\s*("(?:login|navigation\.ordini|navigation\.form|form\.customer|form\.article|form\.quantity|form\.discount|form\.package|form\.submit|form\.multi_article)"),\s*(async\s*\(\)\s*=>\s*\{)'

def replacer(match):
    prefix = match.group(1)  # "await this.runOp("name"
    category = match.group(2)  # "category"
    async_start = match.group(3)  # "async () => {"
    return f'{prefix}, {async_start}'

# First pass: remove the category from position 2
content_fixed = re.sub(pattern, replacer, content)

# Second pass: Remove duplicate category parameters at the end of runOp calls
# Pattern: }), "category-duplicate");
# We need to find these and check if they're duplicates

# Actually, let's use a simpler approach:
# Find all lines with runOp that have category BOTH as 2nd param and in a later position
# This is complex, so let's do manual fixes for the known bad lines

print("Fixed runOp parameter order")
print(f"Writing to {file_path}")

with open(file_path, 'w') as f:
    f.write(content_fixed)

print("Done!")
