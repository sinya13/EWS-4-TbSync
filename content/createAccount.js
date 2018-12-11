/*
 * This file is part of EWS-4-TbSync.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. 
 */
 
 "use strict";

Components.utils.import("resource://gre/modules/Task.jsm");
Components.utils.import("chrome://tbsync/content/tbsync.jsm");
//Components.utils.import("chrome://ews4tbsync/content\exchangeapi/common/erAutoDiscover.js");
//Components.utils.import("chrome://ews4tbsync/content\exchangeapi/common/erAutoDiscoverySOAP.js");

var tbSyncEwsNewAccount = {

    startTime: 0,
    maxTimeout: 30,

    onClose: function () {
        return !document.documentElement.getButton("cancel").disabled;
    },

    onLoad: function () {
        this.elementName = document.getElementById('tbsync.newaccount.name');
        this.elementUser = document.getElementById('tbsync.newaccount.user');
        this.elementPass = document.getElementById('tbsync.newaccount.password');
        this.elementServertype = document.getElementById('tbsync.newaccount.servertype');
        
        document.documentElement.getButton("extra1").disabled = true;
        document.documentElement.getButton("extra1").label = tbSync.getLocalizedMessage("newaccount.add_auto","ews");
        document.getElementById('tbsync.newaccount.autodiscoverlabel').hidden = true;
        document.getElementById('tbsync.newaccount.autodiscoverstatus').hidden = true;

        document.getElementById("tbsync.newaccount.name").focus();
    },

    onUnload: function () {
    },

    onUserTextInput: function () {
        document.documentElement.getButton("extra1").disabled = (this.elementName.value == "" || this.elementUser.value == "" || this.elementPass.value == "");
    },

    onUserDropdown: function () {
        document.documentElement.getButton("extra1").label = tbSync.getLocalizedMessage("newaccount.add_" + this.elementServertype.value,"ews");
    },

    onAdd: Task.async (function* () {
        if (document.documentElement.getButton("extra1").disabled == false) {
            let user = this.elementUser.value;
            let password = this.elementPass.value;
            let servertype = this.elementServertype.value;
            let accountname = this.elementName.value;

            if (servertype == "custom") {
                tbSyncEwsNewAccount.addAccount(user, password, servertype, accountname);                
            }
            
            if (servertype == "auto") {

                //is this also valid for EWS?
                if (user.split("@").length != 2) {
                    alert(tbSync.getLocalizedMessage("autodiscover.NeedEmail","ews"))
                    return
                }

                document.documentElement.getButton("cancel").disabled = true;
                document.documentElement.getButton("extra1").disabled = true;
                document.getElementById("tbsync.newaccount.name").disabled = true;
                document.getElementById("tbsync.newaccount.user").disabled = true;
                document.getElementById("tbsync.newaccount.password").disabled = true;
                document.getElementById("tbsync.newaccount.servertype").disabled = true;

                let updateTimer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
                updateTimer.initWithCallback({notify : function () {tbSyncEwsNewAccount.updateAutodiscoverStatus()}}, 1000, 3);

                tbSyncEwsNewAccount.startTime = Date.now();
                tbSyncEwsNewAccount.updateAutodiscoverStatus();

		//do autodiscover via EWS
                let result = yield tbSync.ews.sync.getServerConnectionViaAutodiscover(user, password, tbSyncEwsNewAccount.maxTimeout*1000);            
                updateTimer.cancel();

                document.getElementById('tbsync.newaccount.autodiscoverlabel').hidden = true;
                document.getElementById('tbsync.newaccount.autodiscoverstatus').hidden = true;

                if (result.server) {
                    alert(tbSync.getLocalizedMessage("autodiscover.Ok","ews"));
                    //add account with found server url
                    tbSyncEwsNewAccount.addAccount(result.user, password, servertype, accountname, result.server);                
                } else {                    
                    alert(tbSync.getLocalizedMessage("autodiscover.Failed","ews").replace("##user##", result.user) + "\n\n" + result.error);
                }

                document.getElementById("tbsync.newaccount.name").disabled = false;
                document.getElementById("tbsync.newaccount.user").disabled = false;
                document.getElementById("tbsync.newaccount.password").disabled = false;
                document.getElementById("tbsync.newaccount.servertype").disabled = false;

                document.documentElement.getButton("cancel").disabled = false;
                document.documentElement.getButton("extra1").disabled = false;
            }

        }
    }),

    updateAutodiscoverStatus: function () {
        document.getElementById('tbsync.newaccount.autodiscoverstatus').hidden = false;
        let offset = Math.round(((Date.now()-tbSyncEwsNewAccount.startTime)/1000));
        let timeout = (offset>2) ? " (" + (tbSyncEwsNewAccount.maxTimeout - offset) + ")" : "";

        document.getElementById('tbsync.newaccount.autodiscoverstatus').value  = tbSync.getLocalizedMessage("autodiscover.Querying","ews") + timeout;
    },

    addAccount (user, password, servertype, accountname, url = "") {
        let newAccountEntry = tbSync.ews.getDefaultAccountEntries();
        newAccountEntry.accountname = accountname;
        newAccountEntry.user = user;
        newAccountEntry.servertype = servertype;

        if (url) {
            newAccountEntry.host = url;
            newAccountEntry.https = (url.substring(0,5) == "https") ? "1" : "0";
        }

        //also update password in PasswordManager
        tbSync.ews.setPassword (newAccountEntry, password);

        //create a new EWS account and pass its id to updateAccountsList, which will select it
        //the onSelect event of the List will load the selected account
        window.opener.tbSyncAccounts.updateAccountsList(tbSync.db.addAccount(newAccountEntry));

        window.close();
    }
};
