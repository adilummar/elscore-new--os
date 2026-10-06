import os
import re

directory = "apps/api/src/modules/tutor-hr"

for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith(".ts"):
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()

            content = content.replace("user-data.decorator", "current-user.decorator")
            content = content.replace("UserData", "CurrentUser")
            content = content.replace("auth.types", "auth.interface")
            
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

print("Fixed decorators and interfaces")
