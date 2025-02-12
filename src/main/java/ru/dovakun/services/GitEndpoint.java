package ru.dovakun.services;

import com.vaadin.flow.server.auth.AnonymousAllowed;
import com.vaadin.hilla.BrowserCallable;
import com.vaadin.hilla.Endpoint;
import com.vaadin.hilla.Nonnull;
import lombok.Data;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.lib.ObjectId;
import org.eclipse.jgit.lib.Repository;
import org.eclipse.jgit.revwalk.RevCommit;
import org.eclipse.jgit.revwalk.RevTree;
import org.eclipse.jgit.revwalk.RevWalk;
import org.springframework.beans.factory.annotation.Value;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Endpoint
@BrowserCallable
@AnonymousAllowed
public class GitEndpoint {
    @Value("${git.localRepo}")
    private String pathRepo;

    private final GitService gitService;

    public GitEndpoint(GitService gitService) {
        this.gitService = gitService;
    }

    /**
     * Получает версии файла: оригинальную (до изменений) и изменённую
     */
    public void updateFileContent(String filePath, String content) throws IOException {
        Path fullPath = Paths.get(pathRepo, filePath);
        Files.writeString(fullPath, content, StandardCharsets.UTF_8);
    }
    public Map<String, String> getFileVersions(String commitHash, String filePath) {
        try {
            GitService.FileVersions fileVersions;

            if ("unstaged".equals(commitHash)) {
                fileVersions = gitService.getUncommittedFileVersions(filePath);
            } else {
                fileVersions = gitService.getFileVersions(commitHash, filePath);
            }

            // Преобразуем FileVersions в Map<String, String>
            Map<String, String> result = new HashMap<>();
            result.put("original", fileVersions.oldContent());
            result.put("modified", fileVersions.newContent());

            return result;
        } catch (Exception e) {
            throw new RuntimeException("Ошибка при получении версий файла: " + filePath, e);
        }
    }

    /**
     * Получает список изменённых, но не закоммиченных файлов
     */
    public List<String> getUncommittedChanges() {
        try {
            return gitService.getUncommittedChanges();
        } catch (Exception e) {
            throw new RuntimeException("Ошибка при получении списка незакоммиченных файлов", e);
        }
    }
    public @Nonnull String getFileContent(String commitHash, String filePath) throws IOException, GitAPIException {
        File repoDir = new File(pathRepo);
        try (Git git = Git.open(repoDir)) {
            if (commitHash == null || commitHash.isEmpty() || commitHash.equals("HEAD")) {
                Path targetPath = Paths.get(pathRepo, filePath);
                if (Files.exists(targetPath)) {
                    return Files.readString(targetPath, StandardCharsets.UTF_8);
                } else {
                    return "";
                }
            }

            Repository repository = git.getRepository();
            ObjectId commitId = repository.resolve(commitHash);
            if (commitId == null) {
                return "";
            }
            try (RevWalk revWalk = new RevWalk(repository)) {
                RevCommit commit = revWalk.parseCommit(commitId);
                return getFileContentFromCommit(repository, commit, filePath);
            }
        }
    }
    private String getFileContentFromCommit(Repository repository, RevCommit commit, String filePath) throws IOException {
        RevTree tree = commit.getTree();
        try (org.eclipse.jgit.treewalk.TreeWalk treeWalk = new org.eclipse.jgit.treewalk.TreeWalk(repository)) {
            treeWalk.addTree(tree);
            treeWalk.setRecursive(true);
            while (treeWalk.next()) {
                if (treeWalk.getPathString().equals(filePath)) {
                    ObjectId objectId = treeWalk.getObjectId(0);
                    var loader = repository.open(objectId);
                    byte[] data = loader.getBytes();
                    return new String(data, StandardCharsets.UTF_8);
                }
            }
        }
        return "";
    }
    /**
     * Получает историю коммитов + добавляет "виртуальный" коммит для незакоммиченных изменений
     */
    public List<Map<String, Object>> getAllCommits() {
        try {
            return gitService.getAllCommits();
        } catch (Exception e) {
            throw new RuntimeException("Ошибка при получении истории коммитов", e);
        }
    }
    @Data
    public static class FileNode {
        public String name;
        public String path;
        public boolean directory;
        private List<FileNode> children = new ArrayList<>();
    }
    public @Nonnull List<@Nonnull FileNode> getRepositoryTree() {
        File repoDir = new File(pathRepo);
        return listDirectory(repoDir, "");
    }

    private List<FileNode> listDirectory(File dir, String relativePath) {
        List<FileNode> nodes = new ArrayList<>();
        File[] files = dir.listFiles();
        if (files == null) {
            System.out.println("Директория " + dir.getAbsolutePath() + " недоступна или пуста.");
            return nodes;
        }
        for (File file : files) {
            System.out.println("Найден файл: " + file.getName());
            if (file.getName().equals(".git")) {
                continue;
            }
            FileNode node = new FileNode();
            node.name = file.getName();
            node.path = relativePath.isEmpty() ? file.getName() : relativePath + "/" + file.getName();
            if (file.isDirectory()) {
                node.directory = true;
                node.children = listDirectory(file, node.path);
            } else {
                node.directory = false;
            }
            nodes.add(node);
        }
        return nodes;
    }

    /**
     * Получает список файлов, изменённых в указанном коммите
     */
    public List<String> getChangedFiles(String commitHash) {
        try {
            if ("unstaged".equals(commitHash)) {
                return gitService.getUncommittedChanges();
            }
            List<String> changedFiles = gitService.getChangedFiles(commitHash);
            return changedFiles != null ? changedFiles : List.of(); // Возвращаем пустой список вместо null
        } catch (Exception e) {
            throw new RuntimeException("Ошибка при получении изменённых файлов для коммита: " + commitHash, e);
        }
    }

    /**
     * Создаёт новый коммит с указанными файлами
     */
    public String createCommit(List<String> files, String commitMessage) {
        try {
            return gitService.createCommit(files, commitMessage);
        } catch (Exception e) {
            throw new RuntimeException("Ошибка при создании коммита", e);
        }
    }

    /**
     * Откатывает изменения в файлах (использует `git checkout`)
     */
    public String rollbackChanges(List<String> files) {
        try {
            return gitService.rollbackChanges(files);
        } catch (Exception e) {
            throw new RuntimeException("Ошибка при откате изменений", e);
        }
    }
}
