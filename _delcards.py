import re
p="peanut-tool.html"
with open(p,encoding="utf-8") as f:
    lines=f.readlines()
# 删除 1-indexed 484..564 -> 0-indexed 483..563
s,e=483,563
assert lines[s].strip().startswith('<div class="decision-table-card history-advice-card">'), lines[s]
assert lines[e].strip()=='</div>', repr(lines[e])
del lines[s:e+1]
src="".join(lines)
src=re.sub(r'\n{3,}','\n\n',src)
with open(p,"w",encoding="utf-8") as f:
    f.write(src)
print("deleted 484-564, remaining lines:",len(lines))
