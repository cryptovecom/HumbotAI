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
let isCompleted = false;

// Send content to the API
async function sendToApi(text) {
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

        console.log(response.data?.data?.task_id);

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
    let prefixIndex = 1;

    // Traverse the DOM
    $('*').each(function () {
        if ($(this).is('p') || $(this).is('li')) {
            let elementText = $(this).text().trim();

            if (elementText.split(/\s+/).length > 5) {
                tagsToProcess.push({ element: $(this), text: elementText }); // Store the element and text
                originalText += `${elementText}\n\n\n `; // Add only the content after the colon
                ++prefixIndex;
            }

        }
    });
    console.log(`original text: ${originalText}`);

    // Process the text with the API in batches
    if (originalText.split(/\s+/).length > 0) {
        const taskId = await sendToApi(originalText); // Send text to API
        console.log(`taskId: ${taskId}`);
        if (taskId) {
            const updatedContent = await getToResponse(taskId); // Retrieve the processed text
            console.log(`updatedContent:\n ${updatedContent}`);
            if (updatedContent) {
                const updatedTexts = updatedContent
                    .split(/\d+\./); // Split the processed text into lines
                console.log(`updateTexts:\n ${updatedTexts}`);
                // Replace content in the DOM
                tagsToProcess.forEach((item, index) => {
                    const updatedText = updatedTexts[index]?.trim();
                    if (updatedText) {
                        // Set the updated text with the prefix
                        item.element.text(`${updatedText}`); // Update the DOM element
                    }
                });

                // Write the updated HTML to the output folder
                isCompleted = true;
                
            } else {
                console.error("Failed to retrieve updated content.");
            }
        } else {
            console.error("Failed to send text to the API.");
        }
    }

    if ( isCompleted ) {
        // Write the updated HTML to the output folder
        const outputPath = path.join(outputFolder, path.basename(filePath));
        fs.writeFileSync(outputPath, $.html(), 'utf-8');
        console.log(`Processed and saved: ${outputPath}`);
    }
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
    // console.log(`files: ${files}`);

    for (const file of files) {
        const inputFile = path.join(inputFolder, file);
        // Scrape content from the HTML file
        const scrapedContent = await processHtmlFile(inputFile);
        // console.log(`scrapedContent: ${scrapedContent}`);
        
    }


}

// Run the script
main();
