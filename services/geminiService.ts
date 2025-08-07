
import { GoogleGenAI, Type } from "@google/genai";
import { DescriptionLength, Suggestion, GuideContent, PointOfInterest } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const suggestionsSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.STRING, description: "Nome del punto di interesse" },
            category: { type: Type.STRING, description: "Categoria (es. Museo, Chiesa, Piazza)" },
        },
        required: ["name", "category"],
    },
};

const guideSchema = {
    type: Type.OBJECT,
    properties: {
        informationFound: { type: Type.BOOLEAN, description: "Imposta su 'true' solo se sono state trovate informazioni specifiche e dettagliate sul punto di interesse. Imposta su 'false' se le informazioni sono generiche, assenti, o se il punto di interesse non è riconosciuto." },
        description: { type: Type.STRING, description: "La descrizione principale e dettagliata. Se informationFound è false, questo campo DEVE contenere un messaggio che spiega che non sono disponibili informazioni specifiche per il luogo richiesto." },
        subPoints: {
            type: Type.ARRAY,
            description: "Un array di punti di interesse secondari. Popola questo array SOLO se esistono punti secondari reali e hai informazioni specifiche su di essi. Altrimenti, lascia l'array vuoto.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "Il nome del punto di interesse secondario (es. un'opera d'arte, una cappella)." },
                    description: { type: Type.STRING, description: "Una descrizione dettagliata del punto di interesse secondario. Non fornire informazioni generiche." }
                },
                required: ["name", "description"]
            }
        }
    },
    required: ["informationFound", "description"]
};

const generateImage = async (prompt: string): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9',
            },
        });
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (error) {
        console.error(`Error generating image for prompt "${prompt}":`, error);
        return ''; // Return empty string on failure
    }
};


export const fetchNearbyPlaces = async (lat: number, lon: number): Promise<Suggestion[]> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Elenca fino a 10 punti di interesse famosi (monumenti, chiese, piazze, musei, opere d'arte) vicino alla latitudine ${lat} e longitudine ${lon}.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: suggestionsSchema,
            },
        });

        const jsonText = response.text.trim();
        const suggestions = JSON.parse(jsonText);
        return suggestions as Suggestion[];

    } catch (error) {
        console.error("Error fetching nearby places:", error);
        throw new Error("Impossibile trovare luoghi di interesse nelle vicinanze.");
    }
};

export const fetchLocalityFromCoords = async (lat: number, lon: number): Promise<string> => {
    const prompt = `Dammi il nome della città e la sigla della provincia (o regione, se applicabile) per la latitudine ${lat} e la longitudine ${lon}. Rispondi solo con il nome, ad esempio: "Roma, RM" o "Firenze, FI". Non includere alcuna spiegazione o testo aggiuntivo.`;
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error fetching locality:", error);
        throw new Error("Impossibile determinare la località corrente.");
    }
};

export const fetchDescription = async (
    place: string, 
    length: DescriptionLength, 
    includeSubPoints: boolean, 
    location?: string
): Promise<GuideContent> => {

    const locationContext = location && location.trim() !== '' ? ` che si trova a "${location}"` : '';
    let subPointInstruction = '';
    if (length === DescriptionLength.Long && includeSubPoints) {
        subPointInstruction = "Per i punti di interesse secondari, includi una descrizione dettagliata per un massimo di 5 elementi importanti che si trovano all'interno (come opere d'arte, cappelle, etc.), popolando l'array 'subPoints'. Includili SOLO se hai informazioni specifiche e verificate. Se non ci sono punti interni rilevanti o non hai informazioni specifiche, lascia l'array 'subPoints' vuoto.";
    } else {
        subPointInstruction = "Lascia l'array 'subPoints' vuoto.";
    }

    const prompt = `Agisci come una guida turistica esperta e rispondi in italiano. Fornisci una descrizione ${length === DescriptionLength.Long ? 'lunga e molto dettagliata' : 'breve e concisa'} del punto di interesse: "${place}"${locationContext}.
    
    REGOLE IMPORTANTI:
    1. Se non possiedi informazioni specifiche e verificate su "${place}", imposta il campo 'informationFound' a 'false' e nel campo 'description' scrivi un messaggio che informa l'utente che non sono state trovate informazioni dettagliate per quel luogo. NON inventare informazioni.
    2. Se le informazioni esistono, imposta 'informationFound' a 'true' e fornisci la descrizione. La descrizione deve includere storia, stile artistico, significato culturale e curiosità, se disponibili. Formatta il testo in paragrafi chiari e non usare caratteri di formattazione speciali come asterischi, cancelletti o underscore.
    3. ${subPointInstruction}

    Rispondi SEMPRE e SOLO con un oggetto JSON che rispetti lo schema fornito.`;
    
    try {
        const textResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: guideSchema,
                systemInstruction: "Sei una guida turistica di livello mondiale. Le tue risposte sono informative, coinvolgenti, scritte in un italiano impeccabile e formattate come JSON valido. Non inventi mai informazioni; se non conosci un dettaglio, lo ammetti."
            }
        });

        const jsonText = textResponse.text.replace(/[*#_]/g, '').trim();
        const parsedData = JSON.parse(jsonText) as { informationFound: boolean; description: string; subPoints?: { name: string; description: string }[] };

        if (!parsedData.informationFound) {
            return {
                description: parsedData.description,
                imageUrl: '',
                subPoints: [],
            };
        }

        const imagePromises: Promise<string>[] = [];

        const mainImagePrompt = `Fotografia realistica e di alta qualità di "${place}${locationContext}". Stile cinematografico, luce naturale. L'immagine deve rappresentare specificamente questo luogo, non un'immagine generica. Se non puoi creare una foto specifica e accurata di "${place}${locationContext}", non generare nulla.`;
        imagePromises.push(generateImage(mainImagePrompt));

        const subPointsData = parsedData.subPoints || [];
        subPointsData.forEach(sp => {
            const subPointImagePrompt = `Fotografia realistica e di alta qualità di "${sp.name}", che si trova all'interno di "${place}${locationContext}". Stile artistico. L'immagine deve essere specifica dell'opera/luogo descritto. Se non puoi creare una foto specifica e accurata, non generare nulla.`;
            imagePromises.push(generateImage(subPointImagePrompt));
        });

        const images = await Promise.all(imagePromises);

        const mainImageUrl = images[0];
        const subPointsWithImages: PointOfInterest[] = subPointsData.map((sp, index) => ({
            ...sp,
            imageUrl: images[index + 1]
        }));

        return {
            description: parsedData.description,
            imageUrl: mainImageUrl,
            subPoints: subPointsWithImages,
        };

    } catch (error) {
        console.error("Error fetching description and images:", error);
        throw new Error("Impossibile generare la guida completa.");
    }
};

export const identifyPlaceFromImage = async (base64Data: string, mimeType: string): Promise<string> => {
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType
      },
    };
    const textPart = {
        text: `Identifica il punto di interesse (monumento, edificio, opera d'arte, ecc.) in questa immagine.
        REGOLE:
        1. Rispondi solo con il nome del punto di interesse e la città, se riconoscibile (es. "Colosseo, Roma").
        2. Non aggiungere alcuna frase o spiegazione aggiuntiva.
        3. Se non riesci a identificarlo con certezza, rispondi esattamente con la stringa "Non riconosciuto".`
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        const resultText = response.text.trim();
        if (resultText.toLowerCase() === 'non riconosciuto' || resultText === '') {
            throw new Error("Impossibile identificare il punto di interesse dall'immagine.");
        }
        return resultText;
    } catch (error) {
        console.error("Error identifying place from image:", error);
        if (error instanceof Error && error.message.includes("Impossibile identificare")) {
            throw error;
        }
        throw new Error("Si è verificato un errore durante l'analisi dell'immagine.");
    }
};