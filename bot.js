const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

// Input and output folder paths
const inputFolder = path.join(__dirname, 'inputfolder');
const outputFolder = path.join(__dirname, 'outputfolder');
const API_URL = "https://humbot.ai/api/humbot/v1";
const API_KEY = process.env.API_KEY;

// Detect language from text
async function detectLanguage(originalText) {
    const { franc } = await import("franc"); // Use named import for franc
    const langs = (await import("langs")).default;

    const langCode = franc(originalText); // Detect the language code
    if (langCode === "und") {
        return "Unknown"; // If undetected
    }

    const languageObj = langs.where("3", langCode); // Find language name
    return languageObj ? languageObj.name : "Unknown";
}

// Send content to the API
async function sendToApi(text, detectedLanguage) {
    const modelType = (detectedLanguage === "English") ? "Advanced" : "Enhanced";
    console.log(modelType);
    try {
        const response = await axios.post(`${API_URL}/create`, {
            input: text,
            model_type: "Advanced"
        }, {
            headers: {
                'api-key': API_KEY,
                'Content-Type': 'application/json'
            }
        });

        return response.data?.data?.task_id || null;
    } catch (error) {
        console.error("Error sending to API:", error.message);
        return null;
    }
}

// Retrieve response from API
async function getToResponse(taskId) {
    try {
        while (true) {
            const response = await axios.get(`${API_URL}/retrieve`, {
                headers: {
                    'api-key': API_KEY,
                    'Content-Type': 'application/json'
                },
                params: { task_id: taskId }
            });

            const statusData = response.data?.data;

            if (statusData?.subtask_status === "completed") {
                console.log("Task completed successfully!");
                console.log(`statusData.output: ${statusData.output}`);
                return statusData.output;
            } else if (statusData?.subtask_status === "running") {
                console.log("Task is still running... Waiting for completion.");
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                console.error("Unexpected task status:", statusData?.subtask_status);
                return null;
            }
        }
    } catch (error) {
        console.error("Error retrieving response from API:", error.message);
        return null;
    }
}

async function processHtmlFile(filePath) {
    const htmlContent = fs.readFileSync(filePath, 'utf-8');

    // Load HTML content into Cheerio
    const $ = cheerio.load(htmlContent);

    // Variables to collect and process
    const tagsToProcess = [];
    let originalText = "";
    let originalTextIndex = 0;

    $('p, li').each(function () {
        // Use Cheerio's .contents() to get all child nodes
        let rawContents = $(this).contents();
    
        // Filter to retrieve only text nodes (not elements)
        let elementText = '';
        rawContents.each(function() {
            if (this.type === 'text') {
                elementText += $(this).text().trim() + ' ';
            }
        });
    
        let contentAfterColon = elementText;
    
        if ($(this).is('li')) {
            // For 'li' tags, extract the part after the colon
            contentAfterColon = elementText.includes(':')
                ? elementText.split(':').slice(1).join(':').trim()
                : elementText; // If no colon, use the whole text
        }
    
        const words = contentAfterColon.split(/\s+/);
        // Check if all words are fully uppercase
        const isAllUpperCase = words.every(word => word === word.toUpperCase());
        // Check if all first letters of words are uppercase (Title Case)
        const isAllFirstLetterUpperCase = words.every(word => /^[A-Z]/.test(word));
        // Exclude if all letters are uppercase or all first letters are uppercase
        const isTitleCase = isAllUpperCase || isAllFirstLetterUpperCase;
    
        // Push into tagsToProcess only if it meets the conditions
        if (!isTitleCase && contentAfterColon.split(/\s+/).length > 7) {
            tagsToProcess.push({ element: $(this), text: elementText }); // Store the element and text
            originalText += ` \n#${originalTextIndex+1}. ${contentAfterColon}`; // Add content (split or not)
            
            // console.log(`isTitleCase: ${isTitleCase}`);
            // console.log(`originTextIndex: ${originalTextIndex}. ${contentAfterColon}`);
            
            ++originalTextIndex;
        }
        
        // console.log(`3.originalText: ${originalText}`);
    });
    

    
    console.log(`original text:\n ${originalText}`);

    // Process the text with the API in batches
    if (originalText.split(/\s+/).length > 0) {
        const detectedLanguage = await detectLanguage(originalText);
        // console.log(`detectedLanguage: ${detectedLanguage}`);
        
        const taskId = await sendToApi(originalText, detectedLanguage); // Send text to API
        console.log(`taskId: ${taskId}`);
        if (taskId) {
            const updatedContent = await getToResponse(taskId); // Retrieve the processed text
            // console.log(`updatedContent:\n ${updatedContent}`);

            if (updatedContent) {
                const updatedTexts = updatedContent
                    // .replace(/\n\n\n/g, '###')
                    // .replace(/\n\n/g, '###')
                    // .replace(/######/g, '###')
                    // .replace(/#####/g, '###')
                    // .replace(/####/g, '###')
                    .split(/\d+#\.\s/).filter(part => part.trim() !== '');
                // Replace content in the DOM

                // console.log(`updatedTexts: ${updatedTexts}`);

                tagsToProcess.forEach((item, index) => {
                    const updatedText = updatedTexts[index]?.trim();
                    console.log(`updatedText ${index}: ${updatedText}`);
                    if (updatedText) {
                        // Find the text node directly within the current element
                        const textNode = item.element.contents().filter(function () {
                            return this.type === 'text'; // Select only text nodes
                        });

                        let prefix = ''; // Default prefix
                        // Extract the prefix (text before the colon)
                        if (item.element.is('li')) {
                            const textContent = textNode[0]?.data || ''; // Access the text content of the text node
                            prefix = textContent.includes(':')
                                ? textContent.split(':')[0] + ':' // Get the prefix with the colon
                                : ''; // If no colon, leave prefix empty
                        }
                
                        // Update only the text node without affecting children
                        if (textNode.length > 0) {
                            textNode[0].data = `${prefix} ${updatedText}`; // Replace the text content
                        } else {
                            console.warn(`No direct text node found for index ${index}`);
                        }
                    }
                });
            } else {
                console.error("Failed to retrieve updated content.");
            }
        } else {
            console.error("Failed to send text to the API.");
        }
    }

    // Write the updated HTML to the output folder
    const outputPath = path.join(outputFolder, path.basename(filePath));
    fs.writeFileSync(outputPath, $.html(), 'utf-8');
    console.log(`Processed and saved: ${outputPath}`);
}



// Main function
async function main() {
    // Ensure input folder exists
    if (!fs.existsSync(inputFolder)) {
        console.error("Input folder does not exist.");
        return;
    }

    // Get the first HTML file in the input folder
    const files = fs.readdirSync(inputFolder).filter(file => path.extname(file) === '.html');
    if (files.length === 0) {
        console.error("No HTML files found in the input folder.");
        return;
    }

    for (const file of files) {
        const inputFile = path.join(inputFolder, file);
        // Scrape content from the HTML file
        const scrapedContent = await processHtmlFile(inputFile);
        // console.log(`scrapedContent: ${scrapedContent}`);
        
    }


}

// Run the script
main();
