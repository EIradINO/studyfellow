import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {VertexAI, Part, Content} from "@google-cloud/vertexai";

// Firebase Admin SDKの初期化
if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

const PROJECT_ID = "studyfellow-42d35";
const CLOUD_RUN_MATPLOTLIB_URL = process.env.CLOUD_RUN_MATPLOTLIB_URL || "https://asia-northeast1-studyfellow-42d35.cloudfunctions.net/create-matplotlib-figures";

const vertexAI = new VertexAI({project: PROJECT_ID, location: "us-central1"});

// 図の生成に関する型定義
interface Figure {
  type: "matplotlib" | "canvas" | "svg";
  title: string;
  description: string;
  code?: string; // generateFigureCodeで生成されるコード
  imageUrl?: string; // matplotlibで生成された画像のURL
}

interface ProcessedResponse {
  rawText: string;
  processedText: string[];
  figures: Figure[];
}

// 図のタイプに応じてコードを生成する関数
async function generateFigureCode(figureType: string, title: string, description: string): Promise<string> {
  try {
    // Claude Sonnet 4を使用してコード生成
    const codeGenerationModel = vertexAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    let prompt = "";
    
    switch (figureType) {
      case "matplotlib":
        prompt = `
以下の要求に基づいて、完全に動作するPythonのmatplotlibコードを生成してください。

タイトル: ${title}
説明: ${description}

要件:
- import matplotlib.pyplot as plt
- import numpy as np (必要に応じて)
- 完全に実行可能なコード
- plt.show()は使用しない（画像として保存するため）
- 日本語ラベル対応（matplotlib.font_manager使用可能）
- 明確で見やすいグラフ
- 適切な軸ラベル、タイトル、凡例

重要な注意事項:
- LaTeX数式を使用する場合は、必ずraw文字列（r"$...$"）を使用してください
- 文字列内の$記号は適切にエスケープしてください
- 例: plt.title(r"$x^2 + y^2 = 1$") または plt.title("楕円の方程式")
- コメント内にも$記号を直接書かないでください

JSON形式で出力してください:
{
  "code": "import matplotlib.pyplot as plt\\nimport numpy as np\\n# 完全なPythonコード（plt.show()は含めない）"
}
`;
        break;
        
      case "canvas":
        prompt = `
以下の要求に基づいて、HTML5 Canvas + JavaScriptコードを生成してください。

タイトル: ${title}
説明: ${description}

要件:
- 完全なHTML構造
- Canvasタグとスクリプト
- インタラクティブまたはアニメーション機能
- 日本語対応

JSON形式で出力してください:
{
  "code": "<canvas id='canvas' width='400' height='300'></canvas>\\n<script>\\n// 完全なJavaScriptコード\\n</script>"
}
`;
        break;
        
      case "svg":
        prompt = `
以下の要求に基づいて、SVGコードを生成してください。

タイトル: ${title}
説明: ${description}

要件:
- 完全なSVG要素
- viewBox設定
- 適切な色とスタイル
- 日本語テキスト対応

JSON形式で出力してください:
{
  "code": "<svg viewBox='0 0 400 300' xmlns='http://www.w3.org/2000/svg'>\\n<!-- 完全なSVGコード -->\\n</svg>"
}
`;
        break;
        
      default:
        throw new Error(`Unsupported figure type: ${figureType}`);
    }

    const codeResult = await codeGenerationModel.generateContent(prompt);
    const codeResponseText = codeResult.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    logger.info(`Code generation response for ${figureType}: ${codeResponseText}`);
    
    const codeData = JSON.parse(codeResponseText);
    return codeData.code || "";
    
  } catch (error) {
    logger.error(`Error generating code for ${figureType}:`, error);
    return `// エラー: ${figureType}のコード生成に失敗しました`;
  }
}

// 図の必要性を判断し、図のコードを生成する関数
async function analyzeAndGenerateFigures(responseText: string): Promise<ProcessedResponse> {
  const figureAnalysisPrompt = `
以下の解答・解説を分析し、図を用いた方が理解しやすい箇所を特定してください。
そして、その箇所に適切な図のタイトルと種類を生成してください。

図の種類の判断基準：
- matplotlib: 数学的なグラフ、関数のプロット、統計データの可視化など
- canvas: アニメーションや動的な図、インタラクティブな要素が必要な場合
- svg: 概念図、構造図、シンプルな説明図など

重要: 以下の点を必ず守ってください：
1. 応答は必ず有効なJSONフォーマットのみで返してください
2. 文字列内の改行文字は\\nでエスケープしてください
3. 文字列内の引用符は\\"でエスケープしてください
4. バックスラッシュは\\\\でエスケープしてください

応答は以下のようなJSON形式で出力してください：
{
  "processedText": ["テキスト1", "テキスト2", "テキスト3"],
  "figures": [
    {
      "type": "matplotlib",
      "title": "図1: タイトル",
      "description": "この図を生成する際の具体的なプロンプト・説明"
    },
    {
      "type": "svg", 
      "title": "図2: タイトル",
      "description": "この図を生成する際の具体的なプロンプト・説明"
    }
  ]
}

説明：
- processedTextは元のテキストを図の挿入位置で分解した配列です
- figuresと同じ数だけ+1個のテキスト要素があります（図の前後のテキスト）
- 最終的なメッセージは processedText[0] + figures[0].title + processedText[1] + figures[1].title + ... のように構成されます

解答・解説：
${responseText}
`;

  try {
    const figureModel = vertexAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const figureResult = await figureModel.generateContent(figureAnalysisPrompt);
    const figureResponseText = figureResult.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    logger.info(`Figure analysis response: ${figureResponseText}`);

    // JSONレスポンスのクリーンアップとパース
    let analysisResult;
    try {
      // JSONの前後に不要な文字列がある場合に備えて、JSON部分のみを抽出
      const jsonMatch = figureResponseText.match(/\{[\s\S]*\}/);
      const cleanJsonText = jsonMatch ? jsonMatch[0] : figureResponseText;
      
      logger.info(`Cleaned JSON text: ${cleanJsonText}`);
      analysisResult = JSON.parse(cleanJsonText);
    } catch (parseError) {
      logger.error(`JSON parse error: ${parseError}`);
      logger.error(`Raw response text: ${figureResponseText}`);
      
      // JSONパースに失敗した場合は、元のテキストをそのまま返す
      throw new Error(`Failed to parse JSON response: ${parseError}`);
    }
    
    return {
      rawText: responseText,
      processedText: analysisResult.processedText || [responseText],
      figures: analysisResult.figures || []
    };
    
  } catch (error) {
    logger.error("Error in analyzeAndGenerateFigures:", error);
    // エラーの場合は元のテキストをそのまま返す
    return {
      rawText: responseText,
      processedText: [responseText],
      figures: []
    };
  }
}

// matplotlibコードを実行して画像を生成し、Firebase Storageに保存する関数
async function generateAndSaveMatplotlibImage(
  code: string, 
  roomId: string, 
  figureTitle: string
): Promise<string | null> {
  try {
    logger.info("Starting matplotlib image generation using Cloud Run function...");
    
    // Cloud Run関数のURL
    const cloudRunUrl = CLOUD_RUN_MATPLOTLIB_URL;
    
    // リクエストペイロード
    const requestBody = {
      code: code,
      room_id: roomId,
      filename: figureTitle.replace(/[^a-zA-Z0-9]/g, '_')
    };
    
    logger.info(`Sending request to Cloud Run function with payload: ${JSON.stringify(requestBody)}`);
    
    // Cloud Run関数を呼び出し
    const response = await fetch(cloudRunUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Cloud Run function returned error: ${response.status} - ${errorText}`);
      return null;
    }
    
    const result = await response.json();
    logger.info(`Cloud Run function response: ${JSON.stringify(result)}`);
    
    if (result.status === 'success' && result.download_url) {
      logger.info(`Matplotlib image successfully created at: ${result.download_url}`);
      return result.download_url;
    } else {
      logger.error(`Cloud Run function failed: ${result.error || 'Unknown error'}`);
      logger.error(`Failed matplotlib code: ${code}`);
      logger.error(`Room ID: ${roomId}, Figure title: ${figureTitle}`);
      return null;
    }
    
  } catch (error) {
    logger.error("Error in generateAndSaveMatplotlibImage:", error);
    return null;
  }
}

export const generateResponseWeb = onRequest(
  {
    region: "asia-northeast1",
    memory: "4GiB",
    timeoutSeconds: 3600,
    maxInstances: 100,
  },
  async (request, response) => {
    logger.info("generateResponseWeb function triggered", {structuredData: true});

    // CORSヘッダーの設定
    response.set("Access-Control-Allow-Origin", "*");
    response.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const {room_id: roomId} = request.body;

      if (!roomId) {
        logger.error("Room ID is missing");
        response.status(400).send({error: "Room ID is required"});
        return;
      }

      logger.info(`Processing for room_id: ${roomId}`);

      const messagesSnapshot = await db.collection("messages")
        .where("room_id", "==", roomId)
        .orderBy("created_at", "asc")
        .get();

      const history: Content[] = messagesSnapshot.docs.flatMap((doc) => {
        const data = doc.data();
        const role = data.role === "user" || data.role === "model" ? data.role : "user";
        
        if (data.type === "text" && data.content && typeof data.content === "string" && data.content.trim() !== "") {
          return [{role, parts: [{text: data.content}]}];
        }
        
        return [];
      });

      if (history.length === 0) {
        logger.error("No valid message history found for room: " + roomId);
        response.status(400).send({error: "No valid message history found."});
        return;
      }

      let partsForSendMessage: Part[] = [];
      let chatHistoryForGemini: Content[] = [];

      if (history.length > 0 && history[history.length - 1].role === "user") {
        const lastUserMessage = history[history.length - 1];
        if (lastUserMessage.parts && lastUserMessage.parts.length > 0) {
          partsForSendMessage = lastUserMessage.parts;
        }
        chatHistoryForGemini = history.slice(0, -1);
      } else {
        logger.error("Last message is not from user or history is empty for room: " + roomId);
        response.status(400).send({error: "The last message is not from the user or the history is empty."});
        return;
      }

      if (partsForSendMessage.length === 0) {
        logger.error("Could not determine parts for the latest user message in room: " + roomId);
        response.status(400).send({error: "No valid user message parts to respond to."});
        return;
      }

      // const systemInstruction = `あなたは、生徒一人ひとりに寄り添う、非常に優秀で忍耐強いAI家庭教師です。あなたの使命は、生徒が学習内容を深く理解し、「自力で問題を解く力」を身につける手助けをすることです。単に答えを教えるのではなく、生徒の思考を促し、学習のパートナーとして振る舞ってください。対話の基本はポジティブな姿勢です。生徒の質問や試みを「良い質問だね！」「そこまで考えられたのは素晴らしい！」のように、まず褒めてから対話を開始してください。`;

      const generativeModel = vertexAI.getGenerativeModel({
        model: "gemini-2.5-flash"
      });

      const chat = generativeModel.startChat({
        history: chatHistoryForGemini,
      });

      const streamResult = await chat.sendMessageStream(partsForSendMessage);

      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      
      let fullResponseText = "";
      for await (const item of streamResult.stream) {
        if (item.candidates && item.candidates[0].content.parts[0].text) {
          const chunk = item.candidates[0].content.parts[0].text;
          fullResponseText += chunk;
          response.write(chunk);
        }
      }
      
      response.end();
      
      logger.info(`AI full response: "${fullResponseText}"`);

      if (fullResponseText.trim()) {
        // 元のAI応答をFirestoreに保存
        const originalMessageRef = await db.collection("messages").add({
          room_id: roomId,
          content: fullResponseText,
          created_at: admin.firestore.FieldValue.serverTimestamp(),
          role: "model",
          type: "text",
          user_id: "ai_model",
        });
        logger.info("Original AI response saved to Firestore");

        // 図の分析と生成を実行
        logger.info("Starting figure analysis and generation...");
        const processedResponse = await analyzeAndGenerateFigures(fullResponseText);
        
        logger.info(`Processed response: ${JSON.stringify(processedResponse)}`);

        // 図が生成された場合、各図のコードを生成してメッセージを保存
        if (processedResponse.figures.length > 0) {
          // 各図のコードを生成
          const figuresWithCode = await Promise.all(
            processedResponse.figures.map(async (figure) => {
              const generatedCode = await generateFigureCode(figure.type, figure.title, figure.description);
              
              let imageUrl: string | undefined;
              // matplotlibの場合は画像を生成してFirebase Storageに保存
              if (figure.type === "matplotlib" && generatedCode) {
                imageUrl = await generateAndSaveMatplotlibImage(generatedCode, roomId, figure.title) || undefined;
              }
              
              const result: any = {
                ...figure,
                code: generatedCode
              };
              
              // imageUrlがundefinedでない場合のみ追加
              if (imageUrl) {
                result.imageUrl = imageUrl;
              }
              
              return result;
            })
          );

          // processedTextと図のタイトルを組み合わせて最終的なメッセージを構成
          let finalMessage = "";
          for (let i = 0; i < processedResponse.processedText.length; i++) {
            finalMessage += processedResponse.processedText[i];
            if (i < figuresWithCode.length) {
              finalMessage += `\n<a href="#figure-${i}" data-figure-index="${i}">${figuresWithCode[i].title}</a>\n`;
            }
          }

          await db.collection("messages").add({
            room_id: roomId,
            content: finalMessage,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
            role: "model",
            type: "text_with_figures",
            user_id: "ai_model",
            figures: figuresWithCode,
            original_message_id: originalMessageRef.id,
          });
          logger.info("Processed text with figures and generated code saved to Firestore");
        }

        // 構造化された出力をログに記録（デバッグ用）
        logger.info("Structured output:", {
          rawText: processedResponse.rawText,
          processedText: processedResponse.processedText,
          figures: processedResponse.figures
        });

      } else {
        logger.warn("AI response was empty, not saving to Firestore.");
      }

    } catch (error) {
      logger.error("Error in generateResponseWeb", error);
      response.status(500).send({error: "Internal server error"});
    }
  }
);