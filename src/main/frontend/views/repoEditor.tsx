// RepoEditor.tsx
import React, { useEffect, useState, useMemo } from "react";
import { SplitLayout, Button, TextField } from "@vaadin/react-components";
import Editor from "@monaco-editor/react";
import {debounce} from "@mui/material";
import {ViewConfig} from "@vaadin/hilla-file-router/types.js";
import {GitEndpoint} from "Frontend/generated/endpoints";

export type FileNode = {
    name: string;
    path: string;
    directory: boolean;
    children?: FileNode[];
};
export const config: ViewConfig = {
    menu: {
        order: 2,
        icon: 'line-awesome/svg/file.svg'
    },
    title: 'editor',
    rolesAllowed: ['ADMIN'],
};

export default function RepoEditor() {
    const [repoTree, setRepoTree] = useState<FileNode[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string>("");
    const [commitMessage, setCommitMessage] = useState<string>("");

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

    const handleEditorChange = (value: string | undefined) => {
        const newContent = value || "";
        setFileContent(newContent);
        debouncedUpdateFile(newContent);
    };

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
                        </div>
                    </>
                ) : (
                    <div>Выберите файл из дерева для редактирования</div>
                )}
            </div>
        </SplitLayout>
    );
}

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