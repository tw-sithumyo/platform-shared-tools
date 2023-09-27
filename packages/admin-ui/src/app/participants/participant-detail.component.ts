import {Component, OnInit, ViewChild} from "@angular/core";
import {ActivatedRoute} from "@angular/router";
import {MessageService} from "src/app/_services_and_types/message.service";
import * as uuid from "uuid";

import {
	ParticipantTypes,
	IParticipantNetDebitCapChangeRequest,
	IParticipant,
	IParticipantAccount,
	IParticipantAllowedSourceIp,
	ParticipantFundsMovementDirections,
	ParticipantEndpointTypes,
	ParticipantEndpointProtocols,
	IParticipantAccountChangeRequest,
	IParticipantFundsMovement,
	IParticipantEndpoint,
	IParticipantSourceIpChangeRequest,
	ParticipantAllowedSourceIpsPortModes
} from "@mojaloop/participant-bc-public-types-lib";
import {ParticipantsService} from "src/app/_services_and_types/participants.service";
import {BehaviorSubject, Observable} from "rxjs";
import {
	NgbModal,
	NgbModalRef,
	NgbNav,
} from "@ng-bootstrap/ng-bootstrap";
import {validateCIDR, validatePortRange, validatePorts} from "../_utils";

@Component({
	selector: "app-participant-detail",
	templateUrl: "./participant-detail.component.html",
})
export class ParticipantDetailComponent implements OnInit {
	private _participantId!: string;
	public participant: BehaviorSubject<IParticipant | null> =
		new BehaviorSubject<IParticipant | null>(null);

	endpointCreateModeEnabled = false;
	endpointEditModeEnabled = false;
	endpointEditingId: string = "";

	accountCreateModeEnabled = false;
	accountEditModeEnabled = false;
	newParticipantAccount: IParticipantAccount | null = null;
	editingParticipantAccountOriginalData?: IParticipantAccount;

	sourceIpCreateModeEnabled = false;
	sourceIpEditModeEnabled = false;
	newSourceIp: any;
	editingSourceIpOriginalData?: IParticipantAllowedSourceIp;
	sourceIpEditingPortsListStr: string = "";
	sourceIpEditingPortRangeStart: number = 0;
	sourceIpEditingPortRangeEnd: number = 0;

	ndcCreateModeEnabled = false;
	ndcEditModeEnabled = false;
	newNDC: IParticipantNetDebitCapChangeRequest | null = null;

	@ViewChild("nav") // Get a reference to the ngbNav
	navBar!: NgbNav;
	@ViewChild("fundsMovementModal") // Get a reference to the depositModal
	fundsMovementModal!: NgbModal;
	fundsMovementModalRef?: NgbModalRef;
	fundsMovementModalMode!: ParticipantFundsMovementDirections;

	constructor(
		private _route: ActivatedRoute,
		private _participantsSvc: ParticipantsService,
		private _messageService: MessageService,
		private _modalService: NgbModal
	) {
	}

	async ngOnInit(): Promise<void> {
		console.log(this._route.snapshot.routeConfig?.path);
		if (this._route.snapshot.routeConfig?.path === this._participantsSvc.hubId) {
			this._participantId = this._participantsSvc.hubId;
		} else {
			const id = this._route.snapshot.paramMap.get("id");
			if (!id) throw new Error("Invalid id param in participant detail");
			this._participantId = id;
		}

		if (!this._participantId) {
			throw new Error("invalid participant id");
		}

		await this._fetchParticipant();
		this.updateAccounts();
	}

	private async _fetchParticipant(): Promise<void> {
		return new Promise((resolve) => {
			this._participantsSvc.getParticipant(this._participantId).subscribe((participant) => {
				this.participant.next(participant);
				resolve();
			});
		});
	}

	tabChange(e: any) {
		if (this.editing) {
			e.preventDefault();
			console.log(`Tab changed to ${e.nextId} prevented`);
		} else {
			console.log(`Tab changed to ${e.nextId}`);
		}
	}

	// any editing going on this page?
	get editing(): boolean {
		return this.endpointCreateModeEnabled || this.endpointEditModeEnabled ||
			this.sourceIpCreateModeEnabled || this.sourceIpEditModeEnabled ||
			this.ndcCreateModeEnabled || this.ndcEditModeEnabled ||
			this.accountCreateModeEnabled || this.accountEditModeEnabled;
	}

	approve() {
		this._participantsSvc.approveParticipant(this._participantId)
			.subscribe(async () => {
					this._messageService.addSuccess("IParticipant Approved");
					await this._fetchParticipant();
				}, (error) => {
					this._messageService.addError(error.message);
				}
			);
	}

	/*
	 * Endpoints
	 * */

	endpointStartEdit(id: string) {
		this.endpointEditModeEnabled = true;
		this.endpointEditingId = id;
		console.log(`endpointStartEdit id: ${id}`);
	}

	async endpointSaveEdit(id: string) {
		console.log("endpointSaveEdit() called");

		const endpointObj = this.participant.value?.participantEndpoints.find(
			(item) => item.id === id
		);

		if (!endpointObj) {
			throw new Error(`can't find endpoint with id: ${id} on endpointSaveEdit()`);
		}

		const typeElement: HTMLSelectElement | null = document.getElementById(
			`endpointType_${id}`
		) as HTMLSelectElement;

		if (typeElement) {
			endpointObj.type = typeElement.value as ParticipantEndpointTypes;
		} else {
			endpointObj.type = "FSPIOP" as ParticipantEndpointTypes; // default
		}

		const protocolElement: HTMLSelectElement | null = document.getElementById(
			`endpointProtocol_${id}`
		) as HTMLSelectElement;

		if (protocolElement) {
			endpointObj.protocol = protocolElement.value as ParticipantEndpointProtocols;
		} else {
			endpointObj.protocol = "HTTPs/REST" as ParticipantEndpointProtocols; // default
		}

		const valueElement: HTMLInputElement | null = document.getElementById(
			`endpointValue_${id}`
		) as HTMLInputElement;
		if (protocolElement) {
			endpointObj.value = valueElement.value;
		} else {
			endpointObj.value = ""; // default
		}

		// select and bind correct function
		const createOrUpdateEndpoint: (participantId: string, endpoint: IParticipantEndpoint) => Observable<string | void> =
			this.endpointCreateModeEnabled ? this._participantsSvc.createEndpoint.bind(this._participantsSvc) : this._participantsSvc.changeEndpoint.bind(this._participantsSvc);

		createOrUpdateEndpoint(this._participantId, endpointObj).subscribe(async () => {
				this.endpointCreateModeEnabled = false;
				this.endpointEditModeEnabled = false;
				this.endpointEditingId = "";

				await this._fetchParticipant();
			}, (error) => {
				this._messageService.addError(error);
			}
		);

	}

	endpointStopEdit() {
		if (this.endpointCreateModeEnabled) {
			this.participant.value?.participantEndpoints.pop();
		}
		this.endpointCreateModeEnabled = false;
		this.endpointEditModeEnabled = false;
		this.endpointEditingId = "";
	}

	endpointAddNew() {
		const newEndpoint = this._participantsSvc.createEmptyEndpoint();

		this.participant.value?.participantEndpoints.push(newEndpoint);
		this.endpointEditingId = newEndpoint.id;
		this.endpointCreateModeEnabled = true;
		this.endpointEditModeEnabled = true;
	}

	endpointRemote(id: string) {
		console.log("endpointSaveEdit() called");
		const endpointObj = this.participant.value?.participantEndpoints.find(
			(item) => item.id === id
		);
		if (!endpointObj) {
			throw new Error(`can't find endpoint with id: ${id} on endpointRemote()`);
		}

		if (!confirm("Are you sure you want to remove this endpoint?")) return;

		this._participantsSvc.removeEndpoint(this._participantId, endpointObj.id)
			.subscribe(() => {
					this._fetchParticipant();
				}, (error) => {
					this._messageService.addError(error);
				}
			);
	}

	/*
	 * Accounts
	 * */

	onEditAccount(account: IParticipantAccount): void {
		//debugger
		this.accountEditModeEnabled = true;
		this.editingParticipantAccountOriginalData = {...account};
	}

	onCancelEditingAccount(account: IParticipantAccount): void {
		//debugger
		this.accountCreateModeEnabled = false;
		this.accountEditModeEnabled = false;

		Object.assign(account, this.editingParticipantAccountOriginalData);

	}

	onAddAccount(): void {
		this.accountCreateModeEnabled = true;
		this.newParticipantAccount = this._participantsSvc.createEmptyAccount();
	}

	saveEditAccount(account: IParticipantAccount): void {
		// Implement logic to save changes to the account

		const participantAccountChangeRequest: IParticipantAccountChangeRequest = {
			id: uuid.v4(),
			accountId: account.id,
			type: account.type,
			currencyCode: account.currencyCode,
			externalBankAccountId: account.externalBankAccountId,
			externalBankAccountName: account.externalBankAccountName,
			requestType: "ADD_ACCOUNT",
			approvedBy: null,
			approved: false,
			approvedDate: null,
			createdBy: "",
			createdDate: Date.now()
		};

		// check duplicates
		if (this.accountCreateModeEnabled) {
			participantAccountChangeRequest.requestType = "ADD_ACCOUNT";
			const duplicateAccount = this.participant.value?.participantAccounts.find(
				(item) =>
					item.type === account.type &&
					item.currencyCode === account.currencyCode
			);

			if (duplicateAccount) {
				this._messageService.addWarning(
					"Cannot add a second account of the same type and currency"
				);
				this.accountCreateModeEnabled = false;
				return;
			}
		} else {
			participantAccountChangeRequest.requestType = "CHANGE_ACCOUNT_BANK_DETAILS";
		}

		this._participantsSvc.createAccount(this._participantId, participantAccountChangeRequest)
			.subscribe(async () => {
					await this._fetchParticipant();
					this.updateAccounts();
					this.accountCreateModeEnabled = false;
					this.accountEditModeEnabled = false;

					this._messageService.addSuccess(
						"Account change request created!"
					);

				}, (error) => {

					this._messageService.addError(error);
				}
			);
	}

	approveAccountChangeRequest(reqId: string) {
		this._participantsSvc.approveAccountChangeRequest(this._participantId, reqId)
			.subscribe(
				async () => {
					this._messageService.addSuccess("Successfully approved account change request.");

					await this._fetchParticipant();
				},
				(error) => {
					if (this.fundsMovementModalRef)
						this.fundsMovementModalRef!.close();
					this._messageService.addError(
						`Account changes request approval failed with: ${error}`
					);
				}
			);
	}

	rejectAccountChangeRequest(reqId: string) {
		this._messageService.addError("Not implemented (rejectAccountChangeRequest)");
	}

	updateAccounts(showMessage = false) {
		if (!this._participantId) {
			throw new Error("invalid participant id");
		}

		this._participantsSvc.getParticipantAccounts(this._participantId)
			.subscribe((accounts: IParticipantAccount[]) => {
				if (!accounts) return;

				//console.log(accounts);
				this.participant.value!.participantAccounts = accounts;
				this.participant.next(this.participant.value);

				if (showMessage) this._messageService.addSuccess("Account balances refreshed");
			});

		this.navBar.select("accounts");
	}

	/*
	 * Source IPs
	 * */

	onEditSourceIp(sourceIp: IParticipantAllowedSourceIp): void {
		this.sourceIpEditModeEnabled = true;
		this.editingSourceIpOriginalData = JSON.parse(JSON.stringify(sourceIp));

		this.updateLocalPortEditingVarsFromObj(sourceIp);
	}

	updateLocalPortEditingVarsFromObj(sourceIp: IParticipantAllowedSourceIp) {
		if (sourceIp.portMode === ParticipantAllowedSourceIpsPortModes.SPECIFIC) {
			this.sourceIpEditingPortsListStr = sourceIp.ports?.join(",") || "";
		} else if (sourceIp.portMode === ParticipantAllowedSourceIpsPortModes.RANGE) {
			this.sourceIpEditingPortRangeStart = sourceIp.portRange?.rangeFirst || 0;
			this.sourceIpEditingPortRangeEnd = sourceIp.portRange?.rangeLast || 0;
		} else {
			this.sourceIpEditingPortsListStr = "";
			this.sourceIpEditingPortRangeStart = 0;
			this.sourceIpEditingPortRangeEnd = 0;
		}
	}

	onCancelEditingSourceIp(sourceIP: IParticipantAllowedSourceIp): void {
		this.sourceIpEditModeEnabled = false;
		this.sourceIpCreateModeEnabled = false;
		Object.assign(sourceIP, this.editingSourceIpOriginalData);
	}

	onAddSourceIp(): void {
		this.sourceIpCreateModeEnabled = true;
		this.newSourceIp = this._participantsSvc.createEmptySourceIp();

		this.updateLocalPortEditingVarsFromObj(this.newSourceIp);
	}

	// onPortModeChange() {
	// 	if (this.newSourceIp.portMode === "ANY") {
	// 		this.newSourceIp.ports = "";
	// 	} else if (this.newSourceIp.portMode === "SPECIFIC") {
	// 		this.newSourceIp.portRange.rangeFirst = null;
	// 		this.newSourceIp.portRange.rangeLast = null;
	// 	} else if (this.newSourceIp.portMode === "RANGE") {
	// 		this.newSourceIp.ports = "";
	// 	}
	// }

	isSourceIpValid(sourceIp: IParticipantAllowedSourceIp): boolean {
		if (sourceIp.cidr.trim().length === 0) {
			this._messageService.addError("CIDR cannot be empty.");
			return false;
		}

		if (!validateCIDR(sourceIp.cidr.trim())) {
			this._messageService.addError("Invalid CIDR format.");
			return false;
		}

		if (sourceIp.portMode === "RANGE" && sourceIp.portRange) {
			if (this.sourceIpEditingPortRangeStart === 0 || this.sourceIpEditingPortRangeEnd === 0) {
				this._messageService.addError("Invalid Port Range values.");
				return false;
			}

			if (!validatePortRange(this.sourceIpEditingPortRangeStart, this.sourceIpEditingPortRangeEnd)) {
				this._messageService.addError("Invalid Port Range values.");
				return false;
			}
		}

		if (sourceIp.portMode === "SPECIFIC" && sourceIp.ports) {
			if (!validatePorts(this.sourceIpEditingPortsListStr)) {
				this._messageService.addError("Invalid Port value.");
				return false;
			}
		}

		return true;
	}

	saveEditSourceIp(sourceIp: IParticipantAllowedSourceIp): void {
		// Implement logic to save changes

		if (!this.isSourceIpValid(sourceIp)) {
			return;
		}

		const sourceIpChangeRequest: IParticipantSourceIpChangeRequest = {
			id: uuid.v4(),
			allowedSourceIpId: sourceIp.id,
			cidr: sourceIp.cidr,
			portMode: sourceIp.portMode,
			requestType: (this.sourceIpEditModeEnabled ? "CHANGE_SOURCE_IP" : "ADD_SOURCE_IP"),
			approvedBy: null,
			approved: false,
			approvedDate: null,
			createdBy: "",
			createdDate: Date.now()
		};

		if (sourceIp.portMode === "SPECIFIC") {
			sourceIpChangeRequest.ports = this.sourceIpEditingPortsListStr.split(",").map(value => Number(value));
		} else if (sourceIp.portMode === "RANGE") {
			sourceIpChangeRequest.portRange = {
				rangeFirst: this.sourceIpEditingPortRangeStart,
				rangeLast: this.sourceIpEditingPortRangeEnd
			};
		}

		// check for duplicates
		const duplicateCidr = this.participant.value?.participantSourceIpChangeRequests.find(
			item => item.cidr === sourceIp.cidr && item.id !== sourceIp.id
		);

		if (duplicateCidr) {
			this._messageService.addWarning("Another SourceIP with the same CIDR already exists.");
			return;
		}

		this._participantsSvc.createSourceIp(this._participantId, sourceIpChangeRequest).subscribe(async () => {
				await this._fetchParticipant();

				this.sourceIpCreateModeEnabled = this.sourceIpEditModeEnabled = false;
				this._messageService.addSuccess("SourceIP change request created!");

			}, (error: any) => {
				console.error(error);
				this._messageService.addError(error.message || error);
			}
		);
	}

	approveSourceIpChangeRequest(reqId: string) {
		this._participantsSvc
			.approveSourceIpChangeRequest(this._participantId, reqId)
			.subscribe(
				async () => {
					this._messageService.addSuccess("Successfully approved SourceIP change request.");

					await this._fetchParticipant();
				},
				(error) => {
					if (this.fundsMovementModalRef)
						this.fundsMovementModalRef!.close();
					this._messageService.addError(
						`SourceIP changes request approval failed with: ${error}`
					);
				}
			);
	}

	rejectSourceIpChangeRequest(reqId: string) {
		this._messageService.addError("Not implemented (rejectSourceIpChangeRequest)");
	}

	createFundsMov(e: Event) {
		if (!this.fundsMovementModalRef) return;

		let valid = true;

		const depositAmountElem: HTMLInputElement = document.getElementById(
			"depositAmount"
		) as HTMLInputElement;
		depositAmountElem.classList.remove("is-invalid");

		const amount = depositAmountElem.valueAsNumber; // guarantee it's a number
		if (!amount || amount < 0) {
			depositAmountElem.classList.add("is-invalid");
			valid = false;
		}
		const depositCurrencyCodeElem: HTMLSelectElement = document.getElementById(
			"depositCurrencyCode"
		) as HTMLSelectElement;
		depositCurrencyCodeElem.classList.remove("is-invalid");
		const currency = depositCurrencyCodeElem.value; // depositCurrencyCodeElem.options[depositCurrencyCodeElem.selectedIndex].value;

		const found = this.participant.value?.participantAccounts.find((item) => {
			return item.currencyCode === currency && item.type === "POSITION";
		});
		if (!found) {
			depositCurrencyCodeElem.classList.add("is-invalid");
			valid = false;
		}

		const depositExtRefElem: HTMLInputElement = document.getElementById(
			"depositExtRef"
		) as HTMLInputElement;
		const depositNoteElem: HTMLInputElement = document.getElementById(
			"depositNote"
		) as HTMLInputElement;

		if (!valid) return;

		const fundsMov: IParticipantFundsMovement = {
			id: uuid.v4(),
			amount: amount.toString(),
			currencyCode: currency,
			createdBy: "",
			createdDate: Date.now(),
			direction: this.fundsMovementModalMode,
			note: depositNoteElem.value,
			extReference: depositExtRefElem.value,
			approved: false,
			approvedBy: null,
			approvedDate: null,
			transferId: null,
		};

		this._participantsSvc
			.createFundsMovement(this._participantId, fundsMov)
			.subscribe(
				async () => {
					this.fundsMovementModalRef!.close();
					this._messageService.addSuccess(
						"Funds movement created with success!"
					);
					await this._fetchParticipant();
					this.navBar.select("fundsMovs");
				},
				(error) => {
					this.fundsMovementModalRef!.close();
					this._messageService.addError(
						`Funds movement creation failed with error: ${error}`
					);
				}
			);
	}

	approveFundsMov(fundsMovId: string) {
		this._participantsSvc
			.approveFundsMovement(this._participantId, fundsMovId)
			.subscribe(
				async () => {
					this._messageService.addSuccess(
						"Funds movement approved with success!"
					);
					await this._fetchParticipant();
					this.updateAccounts();
				},
				(error) => {
					if (this.fundsMovementModalRef)
						this.fundsMovementModalRef!.close();
					this._messageService.addError(
						`Funds movement approval failed with error: ${error.message}`
					);
				}
			);
	}

	rejectFundsMov(fundsMovId: string) {
		this._messageService.addError("Not implemented (rejectFundsMov)");
	}

	ndcAddNew() {
		const newNDC = this._participantsSvc.createEmptyNDC();

		this.newNDC = newNDC;
		this.ndcCreateModeEnabled = true;
		this.ndcEditModeEnabled = true;
	}

	setNDCType(event: any) {
		const type = event.target.value;
		if (!this.newNDC) {
			throw new Error(`newNDC is empty to create`);
		}
		this.newNDC.type = type;
	}

	createNDCRequest() {
		if (!this.newNDC) {
			throw new Error("newNDC is empty to create");
		}

		if (this.newNDC.type === "ABSOLUTE") {
			const fixedValue = document.getElementById("ndcAmount") as HTMLInputElement;
			this.newNDC.fixedValue = Number(fixedValue.value);
		} else if (this.newNDC.type === "PERCENTAGE") {
			const percentage = document.getElementById("ndcPercentage") as HTMLInputElement;
			this.newNDC.percentage = Number(percentage.value);
		} else {
			this._messageService.addWarning("Invalid Net Debit Cap Type");
			return;
		}

		const currencyElement = document.getElementById("ndcCurrency") as HTMLSelectElement;

		if (!currencyElement) {
			this._messageService.addWarning("Invalid Net Debit Cap Currency");
			return;
		}
		this.newNDC.currencyCode = currencyElement.value;

		// // check overlaps
		// if(this.participant.value?.netDebitCaps) {
		// 	const duplicateNDC = this.participant.value.netDebitCaps.find(
		// 		(item) =>
		// 			item.currencyCode === this.newNDC!.currencyCode
		// 	);
		// 	if (duplicateNDC) {
		// 		this._messageService.addWarning("An Net Debit Cap already exists for that currency");
		// 		return;
		// 	}
		// }
		// TODO check duplicates also in requests (pending approval)

		this._participantsSvc.createNDC(this._participantId, this.newNDC).subscribe(async (value) => {
				this.ndcCreateModeEnabled = false;
				this.ndcEditModeEnabled = false;
				this.newNDC = null;

				await this._fetchParticipant();
			},
			(error) => {
				this._messageService.addError(error.message);
			}
		);
	}

	ndcStopEdit() {
		if (this.ndcCreateModeEnabled) {
			this.newNDC = null;
		}
		this.ndcCreateModeEnabled = false;
		this.ndcEditModeEnabled = false;
	}

	approveNDCRequest(reqId: string) {
		this._participantsSvc
			.approveNDC(this._participantId, reqId)
			.subscribe(
				async () => {
					this._messageService.addSuccess("NDC Request approved with success!");

					await this._fetchParticipant();
				},
				(error) => {
					if (this.fundsMovementModalRef)
						this.fundsMovementModalRef!.close();
					this._messageService.addError(
						`NDC Request approval failed with error: ${error.message}`
					);
				}
			);
	}

	rejectNDCRequest(reqId: string) {
		this._messageService.addError("Not implemented (rejectNDCRequest)");
	}

	showDeposit() {
		this.fundsMovementModalMode = ParticipantFundsMovementDirections.FUNDS_DEPOSIT;
		this.fundsMovementModalRef = this._modalService.open(
			this.fundsMovementModal,
			{centered: true}
		);
	}

	showWithdrawal() {
		this.fundsMovementModalMode = ParticipantFundsMovementDirections.FUNDS_WITHDRAWAL;
		this.fundsMovementModalRef = this._modalService.open(
			this.fundsMovementModal,
			{centered: true}
		);
	}

	async copyParticipantIdToClipboard() {
		await navigator.clipboard.writeText(this._participantId || "");
	}
}
