/*
 * This file is part of EWS-4-TbSync.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. 
 */
 
 "use strict";

ews.sync = {

    failed: function (msg = "") {
        let e = new Error(); 
        e.message = msg;
        e.type = "ews4tbsync";
        return e; 
    },

    succeeded: function (msg = "") {
        let e = new Error(); 
        e.message = "OK";
        if (msg) e.message = e.message + "." + msg; 
        e.type = "ews4tbsync";
        return e; 
    },


    getServerConnectionViaAutodiscover: Task.async (function* (user, password, timeout) {
        //EWS API SIMULATION: lets simulate the result for autodiscover
        yield tbSync.sleep(timeout/10, false);
        return {"server": "https://www.test.de", "user": user, "errorcode": "200", "error": ""};
    }),


    
    folderList: Task.async (function* (syncdata) {
        //sync states are only printed while the account state is "syncing" to inform user about sync process (it is not stored in DB, just in syncdata)
        //example state "getfolders" to get folder information from server
        //if you send a request to a server and thus have to wait for answer, use a "send." syncstate, which will give visual feedback to the user,
        //that we are waiting for an answer with timeout countdown
        tbSync.setSyncState("send.getfolders", syncdata.account);
        yield tbSync.sleep(3500);
        tbSync.setSyncState("eval.folders", syncdata.account); 
        yield tbSync.sleep(500);

        //EWS API SIMULATION: lets simulate that a new folder of random type has been found on the server and add it to our DB
        let type = Math.floor(Math.random() * 3);
        if (type == 3) type = 2;
        let types = ["addressbook","calendar","task"]; //i just picked these types, getThunderbirdFolderType must match these (needs to be replaced with true EWS folder types)
        let id = Date.now();
    
        let newFolder = {};
        newFolder.folderID = id.toString();
        newFolder.name = "EWS " + id;
        newFolder.type = types[type];
        newFolder.parentID = "0"; //root - tbsync flatens hierachy, using parentID to sort entries
        newFolder.selected = "1"; //only select address books, tasks and calendars!
        tbSync.db.addFolder(syncdata.account, newFolder);            
    }),


    allPendingFolders: Task.async (function* (syncdata) {
        do {
            //any pending folders left?
            let folders = tbSync.db.findFoldersWithSetting("status", "pending", syncdata.account);
            if (folders.length == 0) {
                //all folders of this account have been synced
                throw ews.sync.succeeded();
            }

            //what folder are we syncing?
            syncdata.folderID = folders[0].folderID;
            syncdata.type = folders[0].type;
                                    
            try {
                switch ( syncdata.type) {
                    case "addressbook": 
                        // check SyncTarget
                        if (!tbSync.checkAddressbook(syncdata.account, syncdata.folderID)) {
                            //could not create target
                            throw ews.sync.failed("notargets");         
                        }

                        //get sync target of this addressbook
                        syncdata.targetId = tbSync.db.getFolderSetting(syncdata.account, syncdata.folderID, "target");
                        syncdata.addressbookObj = tbSync.getAddressBookObject(syncdata.targetId);

                        yield ews.sync.singleFolder(syncdata);
                        break;

                    case "calendar":
                    case "task": 
                        // skip if lightning is not installed
                        if (tbSync.lightningIsAvailable() == false) {
                            throw ews.sync.failed("nolightning");         
                        }
                        
                        // check SyncTarget
                        if (!tbSync.checkCalender(syncdata.account, syncdata.folderID)) {
                            //could not create target
                            throw ews.sync.failed("notargets");         
                        }

                        syncdata.targetId = tbSync.db.getFolderSetting(syncdata.account, syncdata.folderID, "target");
                        syncdata.calendarObj = cal.getCalendarManager().getCalendarById(syncdata.targetId);

                        syncdata.calendarObj.startBatch();
                        yield ews.sync.singleFolder(syncdata);
                        syncdata.calendarObj.endBatch();
                        break;

                    default:
                        throw ews.sync.failed("notsupported");
                        break;
                }
            } catch (e) {
                if (e.type == "ews4tbsync") tbSync.finishFolderSync(syncdata, e.message);
                else {
                    //abort sync of other folders on javascript error
                    tbSync.finishFolderSync(syncdata, "Javascript Error");
                    throw e;
                }
            }                            
        } while (true);
    }),

    
    singleFolder: Task.async (function* (syncdata)  {
        //Pretend to receive remote changes
        {
            tbSync.setSyncState("send.request.remotechanges", syncdata.account, syncdata.folderID);
            yield tbSync.sleep(1500);
        }

        //Pretend to send local changes
        {
            //define how many entries can be send in one request
            let maxnumbertosend = 10;
            
            //access changelog to get local modifications (done and todo are used for UI to display progress)
            syncdata.done = 0;
            syncdata.todo = db.getItemsFromChangeLog(syncdata.targetId, 0, "_by_user").length;

            do {
                tbSync.setSyncState("prepare.request.localchanges", syncdata.account, syncdata.folderID);

                //get changed items from ChangeLog
                let changes = db.getItemsFromChangeLog(syncdata.targetId, maxnumbertosend, "_by_user");
                if (changes == 0)
                break;
                
                for (let i=0; i<changes.length; i++) {
                //EWS API SIMULATION: do something with the Thunderbird object here

                //eval based on changes[i].status (added_by_user, modified_by_user, deleted_by_user)
                db.removeItemFromChangeLog(syncdata.targetId, changes[i].id);
                syncdata.done++; //UI feedback
                }
                tbSync.setSyncState("send.request.localchanges", syncdata.account, syncdata.folderID); 
                yield tbSync.sleep(3500);

                tbSync.setSyncState("eval.response.localchanges", syncdata.account, syncdata.folderID); 	    
                
            } while (true);
        }

        //always finish sync by throwing failed or succeeded
        throw ews.sync.succeeded();
    }),

}
