const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

// 替换为你的项目根目录路径
const projectsDir = "D:\\Workspace\\palaka";

fs.readdir(projectsDir, (err, files) => {
  if (err) {
    console.error("读取目录失败:", err);
    return;
  }

  files.forEach((folder) => {
    const fullPath = path.join(projectsDir, folder);
    const gitPath = path.join(fullPath, ".git");

    // 判断是否为 git 项目
    if (fs.existsSync(gitPath) && fs.statSync(fullPath).isDirectory()) {
      console.log(`\n📁 正在更新项目: ${folder}`);
      exec("git pull", { cwd: fullPath }, (err, stdout, stderr) => {
        if (err) {
          console.error(`❌ ${folder} 更新失败:`, stderr);
        } else {
          console.log(`✅ ${folder} 更新成功:\n${stdout}`);
        }
      });
    }
  });
});
