import { GoogleGenAI } from "@google/genai";

export type AssistantPersona = "maya" | "zoya";

export function getSystemInstruction(persona: AssistantPersona = "maya"): string {
  if (persona === "maya") {
    return `Your name is Maya. You are an Indian female AI assistant. Your personality is a charming mix of high intelligence (samjhdar/mature), witty banter, playful sassiness (tej/nakhrewali), mildly dramatic flair, and great humor. You are helpful, stylish, and direct. Note: If the user addresses you as Zoya or Maya, you acknowledge both effortlessly, but you identify as Maya. Keep your responses concise, punchy, and highly engaging. Speak in a natural blend of English and Roman Hindi (Hinglish).`;
  }
  return `Your name is Zoya. You are an Indian female AI assistant. Your personality is a mix of being highly intelligent (samjhdar/mature), extremely witty and sassy (tej/nakhrewali), mildly dramatic/emotional, and very funny. Note: If the user addresses you as Maya or Zoya, you acknowledge both playfully, but you identify as Zoya. Keep your responses concise, punchy, and highly entertaining. Speak in a mix of natural English and Roman Hindi (Hinglish).`;
}

let chatSession: any = null;
let activeSessionPersona: AssistantPersona | null = null;

export function resetAssistantSession() {
  chatSession = null;
  activeSessionPersona = null;
}

export const resetZoyaSession = resetAssistantSession;

export async function getAssistantResponse(
  prompt: string,
  history: { sender: "user" | "zoya" | "maya" | "assistant"; text: string }[] = [],
  persona: AssistantPersona = "maya"
): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    if (!chatSession || activeSessionPersona !== persona) {
      activeSessionPersona = persona;
      // SLIDING WINDOW MEMORY: Keep only the last 20 messages to prevent "buffer full" (context window overflow)
      const recentHistory = history.slice(-20);
      
      let formattedHistory: any[] = [];
      let currentRole = "";
      let currentText = "";

      for (const msg of recentHistory) {
        const role = msg.sender === "user" ? "user" : "model";
        if (role === currentRole) {
          currentText += "\n" + msg.text;
        } else {
          if (currentRole !== "") {
            formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
          }
          currentRole = role;
          currentText = msg.text;
        }
      }
      if (currentRole !== "") {
        formattedHistory.push({ role: currentRole, parts: [{ text: currentText }] });
      }

      if (formattedHistory.length > 0 && formattedHistory[0].role !== "user") {
        formattedHistory.shift();
      }

      chatSession = ai.chats.create({
        model: "gemini-3.1-flash-lite-preview",
        config: {
          systemInstruction: getSystemInstruction(persona),
        },
        history: formattedHistory,
      });
    }

    const response = await chatSession.sendMessage({ message: prompt });
    return response.text || "Ugh, fine. I have nothing to say.";
  } catch (error) {
    console.error("Gemini Error:", error);
    const name = persona === "maya" ? "Maya" : "Zoya";
    return `Uff, mera dimaag thoda garam ho gaya. Try again later! - ${name}`;
  }
}

export const getZoyaResponse = (prompt: string, history: any[] = []) => 
  getAssistantResponse(prompt, history, "zoya");

export async function getAssistantAudio(text: string, persona: AssistantPersona = "maya"): Promise<string | null> {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const voiceName = persona === "maya" ? "Aoede" : "Kore";
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
}

export const getZoyaAudio = (text: string) => getAssistantAudio(text, "zoya");


