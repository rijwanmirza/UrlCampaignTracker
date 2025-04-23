<?php

namespace App\Console\Commands;

use App\Models\Campaign;
use App\Models\Lead;
use App\Models\Site;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Webklex\IMAP\Facades\Client;
use Carbon\Carbon;
use App\Models\ApiConfig;
use App\Models\OrderLog;
use App\Models\RemovedSite;

class GetEmails extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'get:emails';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Command description';

    /**
     * Create a new command instance.
     *
     * @return void
     */
    public function __construct()
    {
        parent::__construct();
    }
    
    function checkYoutubeVideos($videoIds, $apiKey)
    {
        $videoIdsString = implode(",", $videoIds);
        $url = "https://www.googleapis.com/youtube/v3/videos?part=status,contentDetails&id=$videoIdsString&key=$apiKey";

        $response = file_get_contents($url);
        $data = json_decode($response, true);

        $results = [];

        // If the API returns an error
        if (isset($data["error"])) {
            return [
                'error_status' => 'api_key_error',
                'error_reason' => $data["error"]
            ];
        }


        // Process each video
        foreach ($videoIds as $videoId) {
            $videoStatus = [
                "id" => $videoId,
                "status" => "Not Found" // Default status (in case video is invalid)
            ];

            foreach ($data["items"] as $video) {
                if ($video["id"] === $videoId) {
                    $videoStatus["status"] = $video["status"]["privacyStatus"]; // public, private, unlisted

                    // Check if it's age-restricted
                    if (
                        isset($video["contentDetails"]["contentRating"]["ytRating"]) &&
                        $video["contentDetails"]["contentRating"]["ytRating"] === "ytAgeRestricted"
                    ) {
                        $videoStatus["age_restricted"] = true;
                    } else {
                        $videoStatus["age_restricted"] = false;
                    }

                    // Check if it's country-restricted
                    if (isset($video["contentDetails"]["regionRestriction"]["blocked"])) {
                        $videoStatus["blocked_countries"] = implode(", ", $video["contentDetails"]["regionRestriction"]["blocked"]);
                    } else {
                        $videoStatus["blocked_countries"] = "None";
                    }
                    break;
                }
            }

            $results[] = $videoStatus;
        }

        return $results;
    }
    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle()
    {

        // $client = Client::account('default'); // Load the default account
        $client = Client::make([
            'host'          => env('IMAP_HOST'),
            'port'          => env('IMAP_PORT'),
            'encryption'    => env('IMAP_ENCRYPTION'),
            'validate_cert' => env('IMAP_VALIDATE_CERT'),
            'username'      => env('IMAP_USERNAME'),
            'password'      => env('IMAP_PASSWORD'),
            'protocol'      => 'imap'
        ]); // Load the default account
        $client->connect();


        // Log::info(json_encode($client->getFolders())); die;

        // $inbox = $client->getFolder('INBOX');
        $folders = ["INBOX", "Spam"];

        // Define the date range (last 2 days)
        $since = Carbon::now()->subDays(2)->format('d-M-Y');
        $settings = ApiConfig::select('whitelist_emails', 'multiple')->get()->toArray();
        $senders = (!empty($settings[0]['whitelist_emails']) ? json_decode($settings[0]['whitelist_emails'], true) : ['rijwamirza@gmail.com']);
        $allMessages = collect(); // Laravel collection to store all emails
        
        // Log::info(json_encode($senders));

        // Loop through each sender and fetch emails separately
        foreach ($senders as $sender) {
            foreach ($folders as $folder){
                // $messages = $inbox->messages()->since($since)->from($sender)->get();
                $messages = $client->getFolder($folder)->messages()->since($since)->from($sender)->get();
                $allMessages = $allMessages->merge($messages); // Merge results into collection
            }
        }
        // ->from('rijwamirza@gmail.com')


        $user_id = User::select("id")->first();
        $campaign_id = Campaign::select("id")->first();
        // Log::info("here");
        foreach ($allMessages as $message) {
            
            //echo "Subject: " . $message->getSubject() . "\n";
            //echo "From: " . $message->getFrom()[0]->mail . "\n";
            //echo "Date: " . $message->getDate() . "\n";
            //echo "Body: " . $message->getTextBody() . "\n";
            preg_match('/Order Id\s*:\s*(\d+)/', (!empty($message->getTextBody()) ? $message->getTextBody() : trim(str_replace(["<br>","<br/>"]," ",$message->getHTMLBody()))), $orderId);
            preg_match('/Url\s*:\s*(https?:\/\/[^\s]+)/', (!empty($message->getTextBody()) ? $message->getTextBody() : trim(str_replace(["<br>","<br/>"]," ",$message->getHTMLBody()))), $url);
            preg_match('/Quantity\s*:\s*(\d+)/', (!empty($message->getTextBody()) ? $message->getTextBody() : trim(str_replace(["<br>","<br/>"]," ",$message->getHTMLBody()))), $quantity);

            // Extracted values
            $orderId = $orderId[1] ?? null;
            $url = $url[1] ?? null;
            $quantity = $quantity[1] ?? null;

            if (!empty($orderId) && !empty($url) && !empty($quantity)) {
                $site_exists = Site::where("name", $orderId)->first();
                $log_exists = OrderLog::where("order_id", $orderId)->first();
                if (empty($site_exists->id) && empty($log_exists->id)) {
                    $allowed = true;
                    //Check For youtube
                    /*$api_config = ApiConfig::select('youtube_api')->get()->toArray();
                    if (!empty($api_config[0]['youtube_api'])) {
                        $videoID = explode("?v=", $data['url']);
                        $check = null;
                        if (empty($videoID[1])) {
                            $allowed = false;
                            $videoID = $videoID[1];
                            $check = $this->checkYoutubeVideos([$videoID], $api_config[0]['youtube_api']);
                        }
                        
                        if($allowed && !empty($check['error_status']) && $check['error_status'] == "api_key_error"){
                            Log::info($check['error_reason']);
                        }else if($allowed && !empty($check[0]['status']) && ($check[0]['status'] == "Not Found" || $check[0]['status'] == "private" || $check[0]['status'] == "unlisted")){
                            RemovedSite::insert([
                                "url" => $data['url'],
                                "reason" => "Video is " . $check[0]['status'],
                            ]);
                            $allowed = false;
                            //return redirect()->back()->with("error", "Url Adding Failed, Video is " . $check[0]['status']);
                        }else if($allowed && $check[0]['age_restricted'] === true){
                            RemovedSite::insert([
                                "url" => $data['url'],
                                "reason" => "Video is Age Restricted",
                            ]);
                            $allowed = false;
                            //return redirect()->back()->with("error", "Url Adding Failed, Video is Age Restricted");
                        }else if($allowed && !empty($check[0]['blocked_countries']) && $check[0]['blocked_countries'] != "None") {
                            RemovedSite::insert([
                                "url" => $data['url'],
                                "reason" => "Video is Blocked In " . $check[0]['blocked_countries'],
                            ]);
                            $allowed = false;
                            //return redirect()->back()->with("error", "Url Adding Failed, Video is Blocked In " . $check[0]['blocked_countries']);
                        }
                    }*/
                    
                    if($allowed){
                        $landingID = null;
                        Site::insert([
                            "user_id" => $user_id->id,
                            "campaign_id" => $campaign_id->id,
                            "landing_id" => $landingID,
                            "name" => $orderId,
                            "location" => $url,
                            "quantity" => ceil($quantity * (!empty($settings[0]['multiple']) ? $settings[0]['multiple'] : 1)),
                            "including_current_campaign" => 0
                        ]);
                    }
                    
                    OrderLog::insert([
                        "order_id" => $orderId
                    ]);
                }
            }
            /*Log::info("------ START -------");
            Log::info("Subject: " . $message->getSubject());
            Log::info("From: " . $message->getFrom()[0]->mail);
            Log::info("Date: " . $message->getDate());
            Log::info("Body: " . $message->getTextBody(). " Empty " .empty($message->getTextBody()));
            Log::info("Html: " . strip_tags($message->getHTMLBody()));
            
            preg_match('/Order Id\s*:\s*(\d+)/', (!empty($message->getTextBody()) ? $message->getTextBody() : trim(str_replace(["<br>","<br/>"]," ",$message->getHTMLBody()))), $orderId2);
            preg_match('/Url\s*:\s*(https?:\/\/[^\s]+)/', (!empty($message->getTextBody()) ? $message->getTextBody() : trim(str_replace(["<br>","<br/>"]," ",$message->getHTMLBody()))), $url2);
            preg_match('/Quantity\s*:\s*(\d+)/', (!empty($message->getTextBody()) ? $message->getTextBody() : trim(str_replace(["<br>","<br/>"]," ",$message->getHTMLBody()))), $quantity2);
            Log::info($orderId2[1] ?? null);
            Log::info($url2[1] ?? null);
            Log::info($quantity2[1] ?? null);
            Log::info("------ END -------");*/
        }
        return 0;
    }
}
