// RepoEditor.tsx
import React, { useEffect, useState, useMemo } from "react";
import { SplitLayout, Button, TextField } from "@vaadin/react-components";
import Editor from "@monaco-editor/react";
import { GitEndpoint } from "Frontend/generated/endpoints";
import {debounce} from "@mui/material";

export type FileNode = {
    name: string;
    path: string;
    directory: boolean;
    children?: FileNode[];
};

export default function RepoEditor() {
    // Состояние дерева файлов
    const [repoTree, setRepoTree] = useState<FileNode[]>([]);
    // Путь выбранного файла (относительно корня репозитория)
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    // Содержимое выбранного файла
    const [fileContent, setFileContent] = useState<string>("");
    // Сообщение для коммита (если потребуется отдельный коммит)
    const [commitMessage, setCommitMessage] = useState<string>("");

    // Загружаем дерево файлов при загрузке страницы
    useEffect(() => {
        GitEndpoint.getRepositoryTree()
            .then((data: FileNode[]) => {
                console.log("Полученное дерево файлов:", data);
                setRepoTree(data);
            })
            .catch((err: any) =>
                console.error("Ошибка получения дерева файлов", err)
            );
    }, []);

    // При выборе файла загружаем его содержимое
    useEffect(() => {
        if (selectedFile) {
            GitEndpoint.getFileContent("HEAD", selectedFile)
                .then((content: string) => {
                    setFileContent(content);
                })
                .catch((err: any) =>
                    console.error("Ошибка получения содержимого файла", err)
                );
        }
    }, [selectedFile]);

    // Дебаунс-функция для авто-сохранения файла
    const debouncedUpdateFile = useMemo(
        () =>
            debounce((newContent: string) => {
                if (selectedFile) {
                    GitEndpoint.updateFileContent(selectedFile, newContent).catch((err: any) =>
                        console.error("Ошибка обновления файла", err)
                    );
                }
            }, 500),
        [selectedFile]
    );

    // Обработчик изменений в редакторе
    const handleEditorChange = (value: string | undefined) => {
        const newContent = value || "";
        setFileContent(newContent);
        debouncedUpdateFile(newContent);
    };

    // Пример компонента дерева файлов (можно использовать свой вариант)
    const FileTree: React.FC<{
        treeData: FileNode[];
        onFileSelect: (filePath: string) => void;
    }> = ({ treeData, onFileSelect }) => {
        return (
            <ul style={{ listStyleType: "none", paddingLeft: "1rem" }}>
                {treeData.map((node) => (
                    <FileTreeNode key={node.path} node={node} onFileSelect={onFileSelect} />
                ))}
            </ul>
        );
    };

    const FileTreeNode: React.FC<{
        node: FileNode;
        onFileSelect: (filePath: string) => void;
    }> = ({ node, onFileSelect }) => {
        const [expanded, setExpanded] = useState<boolean>(false);

        const handleClick = () => {
            if (node.directory) {
                setExpanded(!expanded);
            } else {
                onFileSelect(node.path);
            }
        };

        return (
            <li>
                <div
                    onClick={handleClick}
                    style={{ cursor: "pointer", userSelect: "none" }}
                >
                    {node.directory ? (expanded ? "📂" : "📁") : "📄"} {node.name}
                </div>
                {node.directory && expanded && node.children && (
                    <ul style={{ listStyleType: "none", paddingLeft: "1rem" }}>
                        {node.children.map((child) => (
                            <FileTreeNode
                                key={child.path}
                                node={child}
                                onFileSelect={onFileSelect}
                            />
                        ))}
                    </ul>
                )}
            </li>
        );
    };

    return (
        <SplitLayout orientation="horizontal">
            {/* Левая панель – дерево файлов */}
            <div
                style={{
                    width: "30%",
                    borderRight: "1px solid #ccc",
                    padding: "1rem",
                    overflowY: "auto"
                }}
            >
                <h3>Директория репозитория</h3>
                <FileTree treeData={repoTree} onFileSelect={setSelectedFile} />
            </div>

            {/* Правая панель – редактор кода */}
            <div style={{ width: "70%", padding: "1rem" }}>
                <h3>Редактор кода</h3>
                {selectedFile ? (
                    <>
                        <div>
                            <strong>Файл:</strong> {selectedFile}
                        </div>
                        <Editor
                            height="70vh"
                            language={getLanguageFromFileName(selectedFile)}
                            value={fileContent}
                            onChange={handleEditorChange}
                        />
                        {/* Кнопка для создания коммита остаётся, если нужна возможность коммитить изменения */}
                        <div style={{ marginTop: "1rem" }}>
                            <TextField
                                label="Сообщение коммита"
                                value={commitMessage}
                                onChange={(e: any) => setCommitMessage(e.target.value)}
                            />
                            <Button
                                onClick={() => {
                                    if (!selectedFile) {
                                        alert("Выберите файл для коммита");
                                        return;
                                    }
                                    if (!commitMessage) {
                                        alert("Введите сообщение коммита");
                                        return;
                                    }
                                    GitEndpoint.commitFile(selectedFile, fileContent, commitMessage)
                                        .then((commitHash: string) => {
                                            alert(`Коммит создан: ${commitHash}`);
                                        })
                                        .catch((err: any) => {
                                            console.error("Ошибка при коммите", err);
                                            alert("Ошибка при коммите: " + err.message);
                                        });
                                }}
                            >
                                Сделать коммит
                            </Button>
                        </div>
                    </>
                ) : (
                    <div>Выберите файл из дерева для редактирования</div>
                )}
            </div>
        </SplitLayout>
    );
}

/**
 * Утилита для определения языка редактора по расширению файла.
 */
function getLanguageFromFileName(fileName: string): string {
    const extension = fileName.split(".").pop()?.toLowerCase();
    switch (extension) {
        case "js":
        case "jsx":
            return "javascript";
        case "ts":
        case "tsx":
            return "typescript";
        case "java":
            return "java";
        case "py":
            return "python";
        case "html":
            return "html";
        case "css":
            return "css";
        case "json":
            return "json";
        default:
            return "plaintext";
    }
}
