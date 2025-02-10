package ru.dovakun.services;

import com.vaadin.hilla.BrowserCallable;
import com.vaadin.hilla.Endpoint;
import com.vaadin.hilla.Nonnull;
import jakarta.annotation.security.RolesAllowed;
import lombok.Data;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.ResetCommand;
import org.eclipse.jgit.api.RevertCommand;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.diff.DiffEntry;
import org.eclipse.jgit.diff.DiffFormatter;
import org.eclipse.jgit.diff.RawTextComparator;
import org.eclipse.jgit.lib.ObjectId;
import org.eclipse.jgit.lib.Repository;
import org.eclipse.jgit.revwalk.RevCommit;
import org.eclipse.jgit.revwalk.RevTree;
import org.eclipse.jgit.revwalk.RevWalk;
import org.eclipse.jgit.treewalk.CanonicalTreeParser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

@Endpoint
@BrowserCallable
@Component
@RolesAllowed("ADMIN")
public class GitEndpoint {

    @Value("${git.localRepo}")
    private String repoPath;

    // Метод для коммита одного файла (оставляем, если понадобится)
    public @Nonnull String commitFile(String filePath, String content, String commitMessage)
            throws IOException, GitAPIException {
        // Записываем новое содержимое файла
        Path fullPath = Paths.get(repoPath, filePath);
        Files.writeString(fullPath, content, StandardCharsets.UTF_8);

        File repoDir = new File(repoPath);
        try (Git git = Git.open(repoDir)) {
            // Добавляем изменённый файл в индекс
            git.add().addFilepattern(filePath).call();
            // Создаём коммит с указанным сообщением
            RevCommit commit = git.commit().setMessage(commitMessage).call();
            return commit.getName();
        }
    }

    // Новый метод для обновления содержимого файла (авто-сохранение)
    public void updateFileContent(String filePath, String content) throws IOException {
        Path fullPath = Paths.get(repoPath, filePath);
        Files.writeString(fullPath, content, StandardCharsets.UTF_8);
    }

    // Новый метод для коммита нескольких файлов

    public @Nonnull String commitFiles(List<String> filePaths, String commitMessage)
            throws IOException, GitAPIException {
        File repoDir = new File(repoPath);
        try (Git git = Git.open(repoDir)) {
            for (String filePath : filePaths) {
                git.add().addFilepattern(filePath).call();
            }
            RevCommit commit = git.commit().setMessage(commitMessage).call();
            return commit.getName();
        }
    }

    // Новый метод для восстановления (отката) изменений через restore для выбранных файлов

    public @Nonnull String restoreFiles(String commitHash, List<String> filePaths)
            throws IOException, GitAPIException {
        File repoDir = new File(repoPath);
        try (Git git = Git.open(repoDir)) {
            Repository repository = git.getRepository();
            for (String filePath : filePaths) {
                // Получаем содержимое файла из указанного коммита
                String content = getFileContent(commitHash, filePath);
                Path fullPath = Paths.get(repoPath, filePath);
                Files.writeString(fullPath, content, StandardCharsets.UTF_8);
            }
            return "Файлы восстановлены из коммита " + commitHash;
        }
    }

    // Дополнительный метод для получения дерева файлов (с гарантией, что children не null)
    @Data
    public static class FileNode {
        public String name;
        public String path;
        public boolean directory;
        private List<FileNode> children = new ArrayList<>();
    }

    public @Nonnull List<@Nonnull FileNode> getRepositoryTree() {
        File repoDir = new File(repoPath);
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

    // Остальные методы (rollbackCommit, getAllCommits, getFileContent, getFileVersions, и т.д.) остаются без изменений

    public @Nonnull String rollbackCommit(String commitHash) throws GitAPIException, IOException {
        File repoDir = new File(repoPath);
        try (Git git = Git.open(repoDir)) {
            Repository repository = git.getRepository();
            ObjectId commitId = repository.resolve(commitHash);
            if (commitId == null) {
                throw new IllegalArgumentException("Неверный идентификатор коммита");
            }
            try (RevWalk revWalk = new RevWalk(repository)) {
                RevCommit targetCommit = revWalk.parseCommit(commitId);
                ObjectId headId = repository.resolve("HEAD");
                // Если выбранный коммит является HEAD, то делаем reset на предыдущий коммит
                if (commitId.equals(headId)) {
                    if (targetCommit.getParentCount() > 0) {
                        String parentHash = targetCommit.getParent(0).getName();
                        git.reset()
                                .setMode(ResetCommand.ResetType.HARD)
                                .setRef(parentHash)
                                .call();
                        return "Откат к коммиту " + parentHash + " выполнен успешно.";
                    } else {
                        return "Невозможно откатить начальный коммит.";
                    }
                } else {
                    // Если выбранный коммит не является HEAD, выполняем revert (создаём новый коммит-реверт)
                    RevertCommand revertCommand = git.revert();
                    revertCommand.include(targetCommit);
                    RevCommit revertCommit = revertCommand.call();
                    return "Создан коммит-реверт: " + revertCommit.getName();
                }
            }
        }
    }

    public @Nonnull List<@Nonnull CommitInfo> getAllCommits() throws IOException, GitAPIException {
        List<CommitInfo> commitInfos = new ArrayList<>();
        try (Git git = Git.open(new File(repoPath))) {
            Iterable<RevCommit> commitsIterable = git.log().call();
            CommitInfo headCommitInfo = new CommitInfo();

            headCommitInfo.commitId = "HEAD (Текущее состояние)";
            headCommitInfo.commitHash = "HEAD";  // Специальный идентификатор
            headCommitInfo.date = LocalDateTime.now(); // Текущее время
            commitInfos.add(headCommitInfo);

            for (RevCommit commit : commitsIterable) {
                CommitInfo commitInfo = new CommitInfo();
                commitInfo.commitId = commit.getShortMessage();
                commitInfo.commitHash = commit.getName();
                Instant instant = Instant.ofEpochSecond(commit.getCommitTime());
                commitInfo.date = instant.atZone(ZoneId.systemDefault()).toLocalDateTime();
                commitInfos.add(commitInfo);
            }
            return commitInfos;
        }
    }

    public @Nonnull String getFileContent(String commitHash, String filePath) throws IOException, GitAPIException {
        File repoDir = new File(repoPath);
        try (Git git = Git.open(repoDir)) {
            if (commitHash == null || commitHash.isEmpty() || commitHash.equals("HEAD")) {
                Path targetPath = Paths.get(repoPath, filePath);
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

    public @Nonnull FileVersions getFileVersions(String commitHash, String filePath) throws IOException, GitAPIException {
        FileVersions versions = new FileVersions();
        File repoDir = new File(repoPath);
        try (Git git = Git.open(repoDir)) {
            Repository repository = git.getRepository();
            if (commitHash == null || commitHash.isEmpty() || commitHash.equals("HEAD")) {
                Path targetPath = Paths.get(repoPath, filePath);
                if (Files.exists(targetPath)) {
                    versions.setModified(Files.readString(targetPath, StandardCharsets.UTF_8));
                } else {
                    versions.setModified("");
                }
                ObjectId headId = repository.resolve("HEAD^{commit}");
                if (headId != null) {
                    try (RevWalk revWalk = new RevWalk(repository)) {
                        RevCommit headCommit = revWalk.parseCommit(headId);
                        if (headCommit.getParentCount() > 0) {
                            RevCommit parentCommit = revWalk.parseCommit(headCommit.getParent(0));
                            versions.setOriginal(getFileContentFromCommit(repository, parentCommit, filePath));
                        } else {
                            versions.setOriginal("");
                        }
                    }
                } else {
                    versions.setOriginal("");
                }
            } else {
                versions.setModified(getFileContentFromCommit(repository, commitHash, filePath));
                ObjectId commitId = repository.resolve(commitHash);
                try (RevWalk revWalk = new RevWalk(repository)) {
                    RevCommit commit = revWalk.parseCommit(commitId);
                    if (commit.getParentCount() > 0) {
                        RevCommit parentCommit = revWalk.parseCommit(commit.getParent(0));
                        versions.setOriginal(getFileContentFromCommit(repository, parentCommit, filePath));
                    } else {
                        versions.setOriginal("");
                    }
                }
            }
        }
        return versions;
    }

    private String getFileContentFromCommit(Repository repository, String commitHash, String filePath) throws IOException {
        ObjectId commitId = repository.resolve(commitHash);
        if (commitId == null) {
            return "";
        }
        try (RevWalk revWalk = new RevWalk(repository)) {
            RevCommit commit = revWalk.parseCommit(commitId);
            return getFileContentFromCommit(repository, commit, filePath);
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

    public @Nonnull List<@Nonnull String> getChangedFiles(String commitHash)
            throws IOException, GitAPIException {
        List<String> changedFiles = new ArrayList<>();
        try (Git git = Git.open(new File(repoPath));
             RevWalk revWalk = new RevWalk(git.getRepository())) {

            Repository repository = git.getRepository();
            ObjectId commitId = repository.resolve(commitHash);
            RevCommit commit = revWalk.parseCommit(commitId);

            if (commit.getParentCount() == 0) {
                return changedFiles;
            }
            RevCommit parent = revWalk.parseCommit(commit.getParent(0));

            RevTree commitTree = commit.getTree();
            RevTree parentTree = parent.getTree();

            CanonicalTreeParser commitTreeParser = new CanonicalTreeParser();
            CanonicalTreeParser parentTreeParser = new CanonicalTreeParser();

            try (var reader = repository.newObjectReader()) {
                commitTreeParser.reset(reader, commitTree);
                parentTreeParser.reset(reader, parentTree);
            }

            try (DiffFormatter df = new DiffFormatter(System.out)) {
                df.setRepository(repository);
                df.setDiffComparator(RawTextComparator.DEFAULT);
                df.setDetectRenames(true);

                List<DiffEntry> diffs = df.scan(parentTreeParser, commitTreeParser);

                for (DiffEntry diff : diffs) {
                    changedFiles.add(diff.getNewPath());
                }
            }
        }
        return changedFiles;
    }

    @Data
    public static class CommitInfo {
        public String commitId;
        public LocalDateTime date;
        public String commitHash;
    }

    @Data
    public static class FileVersions {
        private String original;
        private String modified;
    }
}
