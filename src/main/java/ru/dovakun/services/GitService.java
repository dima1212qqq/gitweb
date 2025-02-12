package ru.dovakun.services;

import org.eclipse.jgit.api.*;
import org.eclipse.jgit.diff.DiffEntry;
import org.eclipse.jgit.errors.MissingObjectException;
import org.eclipse.jgit.lib.*;
import org.eclipse.jgit.revwalk.RevCommit;
import org.eclipse.jgit.revwalk.RevTree;
import org.eclipse.jgit.revwalk.RevWalk;
import org.eclipse.jgit.treewalk.CanonicalTreeParser;
import org.eclipse.jgit.treewalk.TreeWalk;
import org.eclipse.jgit.treewalk.filter.PathFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;

@Service
public class GitService {

    private final String pathRepo;

    private final Git git;

    public GitService(@Value("${git.localRepo}")String pathRepo) throws Exception {
        this.pathRepo = pathRepo;
        this.git = Git.open(new File(pathRepo)); // Убедись, что путь правильный
    }

    public List<Map<String, Object>> getAllCommits() throws Exception {
        List<Map<String, Object>> commits = new ArrayList<>();
        Iterable<RevCommit> log = git.log().call();

        for (RevCommit commit : log) {
            Map<String, Object> commitInfo = new HashMap<>();
            commitInfo.put("commitHash", commit.getName());
            commitInfo.put("date", commit.getAuthorIdent().getWhen().toString());
            commitInfo.put("message", commit.getFullMessage());

            List<String> changedFiles = getChangedFiles(commit.getName());
            commitInfo.put("files", changedFiles);

            commits.add(commitInfo);
        }
        return commits;
    }


    public record FileVersions(String oldContent, String newContent) {}

    public FileVersions getFileVersions(String commitHash, String filePath) throws Exception {
        Repository repository = git.getRepository();

        if ("unstaged".equals(commitHash)) {
            return getUncommittedFileVersions(filePath);
        }

        ObjectId commitId = repository.resolve(commitHash);
        if (commitId == null) {
            throw new IllegalArgumentException("Коммит не найден: " + commitHash);
        }

        ObjectId prevCommitId = repository.resolve(commitHash + "~1");
        if (prevCommitId == null) {
            throw new IllegalArgumentException("Предыдущий коммит не найден: " + commitHash);
        }

        String oldContent = getFileContent(repository, prevCommitId, filePath);
        String newContent = getFileContent(repository, commitId, filePath);

        return extractRelevantChanges(oldContent, newContent);
    }

    // Метод для вычисления изменённых строк с контекстом
    private FileVersions extractRelevantChanges(String oldContent, String newContent) {
        String[] oldLines = oldContent.isEmpty() ? new String[0] : oldContent.split("\n");
        String[] newLines = newContent.isEmpty() ? new String[0] : newContent.split("\n");

        List<Integer> changedLines = new ArrayList<>();
        int maxLines = Math.max(oldLines.length, newLines.length);

        for (int i = 0; i < maxLines; i++) {
            String oldLine = i < oldLines.length ? oldLines[i] : "";
            String newLine = i < newLines.length ? newLines[i] : "";
            if (!oldLine.equals(newLine)) {
                changedLines.add(i);
            }
        }

        if (changedLines.isEmpty()) {
            return new FileVersions(oldContent, newContent);
        }

        int contextLines = 3; // Количество строк контекста вокруг изменений
        Set<Integer> linesToInclude = new HashSet<>();

        for (int line : changedLines) {
            for (int j = Math.max(line - contextLines, 0); j <= Math.min(line + contextLines, maxLines - 1); j++) {
                linesToInclude.add(j);
            }
        }

        List<String> oldSnippet = new ArrayList<>();
        List<String> newSnippet = new ArrayList<>();

        for (int i = 0; i < maxLines; i++) {
            if (linesToInclude.contains(i)) {
                if (!oldContent.isEmpty()) { // Добавляем в старый сниппет только если оригинал не пуст
                    oldSnippet.add(i < oldLines.length ? oldLines[i] : "");
                }
                newSnippet.add(i < newLines.length ? newLines[i] : "");
            }
        }

        return new FileVersions(
                oldSnippet.isEmpty() ? "" : String.join("\n", oldSnippet),
                String.join("\n", newSnippet)
        );
    }




    public FileVersions getUncommittedFileVersions(String filePath) throws Exception {
        File file = new File(git.getRepository().getWorkTree(), filePath);
        if (!file.exists()) {
            throw new IllegalArgumentException("Файл не найден: " + filePath);
        }

        String newContent = Files.readString(file.toPath(), StandardCharsets.UTF_8);
        String oldContent = getFileContent(git.getRepository(), git.getRepository().resolve("HEAD"), filePath);

        return new FileVersions(oldContent, newContent);
    }

    public List<String> getChangedFiles(String commitHash) throws Exception {
        List<String> files = new ArrayList<>();
        Repository repository = git.getRepository();

        ObjectId commitId = repository.resolve(commitHash);
        if (commitId == null) {
            throw new IllegalArgumentException("Коммит не найден: " + commitHash);
        }

        RevWalk revWalk = new RevWalk(repository);
        RevCommit commit = revWalk.parseCommit(commitId);

        // 🟢 Проверяем, есть ли предыдущий коммит
        RevCommit prevCommit = null;
        if (commit.getParentCount() > 0) {
            prevCommit = revWalk.parseCommit(commit.getParent(0));
        }

        revWalk.close();

        try (ObjectReader reader = repository.newObjectReader()) {
            CanonicalTreeParser newTree = new CanonicalTreeParser();
            newTree.reset(reader, commit.getTree().getId());

            CanonicalTreeParser oldTree = new CanonicalTreeParser();
            if (prevCommit != null) {
                oldTree.reset(reader, prevCommit.getTree().getId());
            }

            List<DiffEntry> diffs = new Git(repository)
                    .diff()
                    .setOldTree(prevCommit != null ? oldTree : null) // Если это первый коммит, oldTree = null
                    .setNewTree(newTree)
                    .call();

            for (DiffEntry diff : diffs) {
                files.add(diff.getNewPath());
            }
        }
        return files;
    }


    public List<String> getUncommittedChanges() throws Exception {
        Status status = git.status().call();
        List<String> changedFiles = new ArrayList<>();
        changedFiles.addAll(status.getModified());
        changedFiles.addAll(status.getAdded());
        changedFiles.addAll(status.getRemoved());
        return changedFiles;
    }

    public String createCommit(List<String> files, String commitMessage) throws Exception {
        for (String file : files) {
            git.add().addFilepattern(file).call();
        }
        git.commit().setMessage(commitMessage).call();
        return "Commit successful";
    }

    public String rollbackChanges(List<String> files) throws Exception {
        for (String file : files) {
            git.checkout().addPath(file).call();
        }
        return "Rollback successful";
    }

    private String getFileContent(Repository repository, ObjectId commitId, String filePath) throws Exception {
        if (commitId == null) {
            return "";
        }

        try (ObjectReader reader = repository.newObjectReader();
             RevWalk revWalk = new RevWalk(repository)) {

            RevCommit commit = revWalk.parseCommit(commitId);
            RevTree tree = commit.getTree();

            try (TreeWalk treeWalk = new TreeWalk(reader)) {
                treeWalk.addTree(tree);
                treeWalk.setRecursive(true);
                treeWalk.setFilter(PathFilter.create(filePath));

                if (!treeWalk.next()) {
                    return "";
                }

                ObjectId blobId = treeWalk.getObjectId(0);
                byte[] data = reader.open(blobId).getBytes();
                return new String(data, StandardCharsets.UTF_8);
            }
        }
    }

    private String extractRelevantLines(String baseContent, String compareContent) {
        String[] baseLines = baseContent.split("\n");
        String[] compareLines = compareContent.split("\n");

        List<Integer> changedLines = new ArrayList<>();
        for (int i = 0; i < Math.max(baseLines.length, compareLines.length); i++) {
            String baseLine = i < baseLines.length ? baseLines[i] : "";
            String compareLine = i < compareLines.length ? compareLines[i] : "";
            if (!baseLine.equals(compareLine)) {
                changedLines.add(i);
            }
        }

        if (changedLines.isEmpty()) {
            return baseContent;
        }

        int start = Math.max(changedLines.get(0) - 4, 0);
        int end = Math.min(changedLines.get(changedLines.size() - 1) + 4, baseLines.length - 1);

        StringBuilder snippet = new StringBuilder();
        for (int i = start; i <= end; i++) {
            snippet.append(baseLines[i]).append("\n");
        }

        return snippet.toString();
    }
}
