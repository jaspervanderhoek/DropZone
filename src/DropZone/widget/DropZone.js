/*jslint browser: true, devel:true, nomen:true, unparam:true, regexp: true*/
/*global define, require, mxui, mx, mendix, Dropzone, logger*/

/*
    DropZone
    ========================
    @file      : Dropzone.js
    @version   : 3.1.0
    @author    : Andries Smit & Chris de Gelder
    @date      : 14-07-2016
    @license   : Apache V2

    Documentation
    ========================
    Drop multiple images or documents and upload

    
    To be done:
    - fix, upload button image
    - is relative dimension, width, height.
    - add modeler parameters for caption of the remove, cancel button and cancel question.
    - test fallback, scenario

 */
define([
    "dojo/_base/declare",
    "mxui/widget/_WidgetBase",
    "dojo/dom-construct",
    "dojo/_base/lang",
    "DropZone/widget/lib/dropzone"
], function (declare, _WidgetBase, domConstruct, dojoLang, Dropzone) {
    "use strict";

    // Declare widget's prototype.
    /** @module {MendixWidget} DropZone.widget.DropZone */
    return declare("DropZone.widget.DropZone", [_WidgetBase], {
        maxFileSize: 0,
        imageentity: "",
        onChangemf: "",
        contextassociation: "",
        panelheight: 200,
        panelwidth: 500,
        buttoncaption: "upload",
        uploadButton: null,
        dropzone: null,
        parallelUploads: 4,
        _contextObj: null,

        /**
         * dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
         * @public
         * @returns {undefined}
         */
        constructor: function () {
            logger.debug(this.id + ".constructor");
            this.dropzone = null;
            this._contextObj = null;
        },
        /**
         * dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
         * @returns {undefined}
         */
        postCreate: function () {
            logger.debug(this.id + ".postCreate");
            this.initDropZone();
        },
        /**
         * mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
         * @param {mendix/lib/MxObject} obj - the current track object, or null if there is none
         * @param {mxui/widget/_WidgetBase~ApplyContextCallback} callback - function to be called when finished
         * @returns {undefined}
         */
        update: function (obj, callback) {
            logger.debug(this.id + ".update");
            this._contextObj = obj;
            mendix.lang.nullExec(callback);
        },
        /**
         * initalize the dropzone library. 
         * @private
         * @returns {undefined}
         */
        initDropZone: function () {
            logger.debug(this.id + ".initDropZone");
            domConstruct.empty(this.domNode);
            if (!this.autoUpload) {
                this.uploadButton = new mxui.widget._Button({
                    caption: this.buttoncaption,
                    onClick: dojoLang.hitch(this, this.onclickEvent),
                    icon: "mxclientsystem/mxui/widget/styles/images/MxFileInput/uploading.gif"
                });
                this.domNode.appendChild(this.uploadButton.domNode);
            }
            this.domNode.appendChild(mxui.dom.div({
                "id": this.id + "_zone",
                "class": "dropzone",
                "style": "height: " + this.panelheight + "px; width: " + this.panelwidth + "px;"
            }));
            this.dropzone = new Dropzone("#" + this.id + "_zone", {
                autoDiscover: false,
                maxFilesize: this.maxFileSize,
                url: dojoLang.hitch(this, this.getMendixURL),
                paramName: "mxdocument",
                autoProcessQueue: this.autoUpload,
                addRemoveLinks: true,
                dictDefaultMessage: this.message,
                accept: dojoLang.hitch(this, this.accept),
                parallelUploads: this.parallelUploads
            });
            this.dropzone.on("success", dojoLang.hitch(this, this.onComplete));
            this.dropzone.on("error", dojoLang.hitch(this, this.onError));
            this.dropzone.on("removedfile", dojoLang.hitch(this, this.onRemoveFile));
        },
        /**
         * set the Mendix upload URL based on the GUID
         * @param {file[]} files
         * @returns {String} url - mendix server URL to post the file to.s 
         */
        getMendixURL: function (files) {
            logger.debug(this.id + ".getMendixURL");
            return "/file?guid=" + files[0].obj.getGuid() + "&maxFileSize=" + this.maxFileSize + "&csrfToken=" + mx.session.getCSRFToken() + "&height=75&width=100";
        },
        /**
         * on error remove the files.
         * @param {type} file - upload files
         * @param {type} message - error message
         * @returns {undefined}
         */
        onError: function (file, message) {
            logger.error(this.id + ".onError", message);
            this.onRemoveFile(file);
        },
        /**
         * an image should be removed from within a microflow, if there is non just delete if via the api
         * @param {type} file - the file that is removed from the list.
         * @param {type} message - status message
         * @returns {undefined}
         */
        onRemoveFile: function (file, message) {
            if (this._beingDestroyed) {
                // dont remove the files when the widget is being destroyed by the uninitialize function.
                return;
            }
            logger.debug(this.id + ".onRemoveFile");
            var obj = file.obj;
            if (obj && this.onRemove) {
                mx.data.action({
                    params: {
                        actionname: this.onRemove,
                        applyto: "selection",
                        guids: [obj.getGuid()]
                    },
                    store: {
                        caller: this.mxform
                    },
                    callback: dojoLang.hitch(this, function (result) {
                        file.obj = null;
                    }),
                    error: function (e) {
                        logger.error("onRemoveFile", e);
                    }
                });
            } else {
                this.removeFile(file);
            }
        },
        /**
         * when uploadload is completed, commit and call onchange MF
         * @param {type} file - the file that is completed
         * @param {type} message - status message
         * @returns {undefined}
         */
        onComplete: function (file, message) {
            logger.debug(this.id + ".onComplete");
            if (file.obj) {
                mx.data.commit({
                    mxobj: file.obj,
                    callback: dojoLang.hitch(this, function () {
                        logger.debug("onComplete");
                        this.callOnChange(file.obj);
                    })
                });
            }
            if (!this.autoUpload) {
				this.dropzone.processQueue(); 
			}
        },
        /**
         * Create file on mendix server, and validate if it could be accepted.
         * @param {File} file - the file that validate
         * @param {function} callback - callback function an acceptance.
         * @returns {undefined}
         */
        accept: function (file, callback) {
            this.createMendixFile(file, dojoLang.hitch(this, function () {
                this.acceptMendix(file, callback);
            }));
        },
        /**
         * Validate if object will be accepted by the mendix server
         * @param {File} file - file to be send to server
         * @param {function} callback - callback function on completion
         * @returns {undefined}
         */
        acceptMendix: function (file, callback) {
            logger.debug(this.id + ".accept");
            var rejectcaption = this.rejectcaption || "rejected";
            if (file.obj && this.onAccept) {
                mx.data.action({
                    params: {
                        actionname: this.onAccept,
                        applyto: "selection",
                        guids: [file.obj.getGuid()]
                    },
                    store: {
                        caller: this.mxform
                    },
                    callback: dojoLang.hitch(this, function (result) {
                        if (!result) {
                            callback(rejectcaption);
                        } else {
                            callback();
                        }
                    }),
                    error: function (e) {
                        logger.error("addedFile", e);
                    }
                });
            } else {
                callback();
            }
        },
        /**
         * Create a mendix empty file object on the server when new upload item is added.
         * Upload of the file be done by the DropZoneJs lib
         * @param {File} file - file that needs te be upladed
         * @param {function} callback
         * @returns {undefined}
         */
        createMendixFile: function (file, callback) {
            logger.debug(this.id + ".createMendixFile");
            mx.data.create({
                entity: this.imageentity,
                callback: dojoLang.hitch(this, function (obj) {
                    var ref = this.contextassociation.split("/");
                    if (obj.has(ref[0])) {
                        obj.set(ref[0], this._contextObj.getGuid());
                    }
                    obj.set(this.nameattr, file.name);
                    if (this.sizeattr) {
                        obj.set(this.sizeattr, file.size);
                    }
                    if (this.typeattr) {
                        obj.set(this.typeattr, file.type);
                    }
                    file.obj = obj;
                    callback();
                }),
                error: function () {
                    logger.error("failed createMendixFile");
                    callback();
                }
            });
        },
        /**
         * Remove file directly via the client API.
         * @param {File} file - file that needs to be removed.
         * @returns {undefined}
         */
        removeFile: function (file) {
            logger.debug(this.id + ".removeFile");
            if (file.obj) {
                mx.data.remove({
                    guid: file.obj.getGuid(),
                    callback: function () {
                        mx.data.sendClassUpdate(file.obj.getEntity());
                        file.obj = null;
                    },
                    error: function (err) {
                        console.log("Error occurred attempting to remove object " + err);
                    }
                });
            }
        },
        /**
         * on click of the upload button start processing the upload queue
         * @returns {undefined}
         */
        onclickEvent: function () {
            logger.debug(this.id + ".onclickEvent");
            this.dropzone.processQueue();
        },
        /**
         * Call onchange Miroflow if any. 
         * @param {mendix/lib/MxObject} obj
         * @returns {undefined}
         */
        callOnChange: function (obj) {
            logger.debug(this.id + ".callOnChange");
            if (obj && this.onChangemf) {
                mx.data.action({
                    params: {
                        actionname: this.onChangemf,
                        applyto: "selection",
                        guids: [obj.getGuid()]
                    },
                    store: {
                        caller: this.mxform
                    },
                    callback: dojoLang.hitch(this, function () {
                        logger.debug("callOnChange");
                    }),
                    error: function (e) {
                        logger.error("callOnChange", e);
                    }
                });
            }
        },
        /**
         * mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
         * Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
         * @returns {undefined}
         */
        uninitialize: function () {
            logger.debug(this.id + ".uninitialize");
            if (this.dropzone) {
                this.dropzone.destroy();
            }
        }
    });
});